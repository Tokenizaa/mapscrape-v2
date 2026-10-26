import puppeteer, { Browser, Page } from 'puppeteer';
import { PlaceRecord, ScrapeJob } from '../../shared/types';
import { getJob, updateJobProgress, insertPlace, findPlaceByUrl, countPlaces } from '../db';
import { writeRunReport } from '../run-report';
import { extractPlaceDetails } from './extractor';
import { writeAuditLog } from '../audit-log';
import { SELECTORS } from './selectors';

interface ActiveJobHandle {
  cancelled: boolean;
  cancel: () => void;
}

const activeJobs = new Map<string, ActiveJobHandle>();

async function safeAudit(input: Parameters<typeof writeAuditLog>[0]): Promise<void> {
  try { await writeAuditLog(input); } catch { /* Diagnostics must never break collection. */ }
}

function missingFields(place: PlaceRecord): string[] {
  const fields: (keyof PlaceRecord)[] = ['name', 'category', 'address', 'phone', 'website', 'rating', 'review_count', 'price_range', 'opening_hours', 'business_status', 'latitude', 'longitude', 'maps_url', 'description', 'services_attributes', 'photos', 'videos', 'logo_url', 'collected_at'];
  return fields.filter((field) => !String(place[field] ?? '').trim());
}


export function isJobRunning(jobId: string): boolean {
  return activeJobs.has(jobId);
}

export function stopScrapeJob(jobId: string): boolean {
  const handle = activeJobs.get(jobId);
  if (handle) {
    handle.cancelled = true;
    handle.cancel();
    return true;
  }
  return false;
}

/**
 * Executes a real Puppeteer collection job on Google Maps.
 */
export async function runScraperJob(
  jobId: string,
  segment: string,
  location: string,
  limitRequested: number,
  onProgress?: (job: ScrapeJob) => void
): Promise<void> {
  const handle: ActiveJobHandle = {
    cancelled: false,
    cancel: () => {
      handle.cancelled = true;
    },
  };
  activeJobs.set(jobId, handle);

  let browser: Browser | null = null;
  let totalFound = 0;
  let totalCollected = 0;
  let totalDuplicates = 0;
  let totalErrors = 0;
  let baselineCount = 0;

  const emitProgress = async (step: string, updates: Partial<ScrapeJob> = {}) => {
    const jobUpdates: Partial<ScrapeJob> = {
      current_step: step,
      total_found: totalFound,
      total_collected: totalCollected,
      total_duplicates: totalDuplicates,
      total_errors: totalErrors,
      ...updates,
    };
    await updateJobProgress(jobId, jobUpdates);
    if (onProgress) {
      const current = await getJob(jobId);
      if (current) onProgress(current);
    }
  };

  try {
    baselineCount = await countPlaces();
    await safeAudit({ category: 'scraper', event: 'job.browser_start', message: 'Inicializando Chromium.', jobId, metadata: { segment, location, limitRequested, databaseCountBefore: baselineCount } });
    await emitProgress('Iniciando navegador Chromium...', { status: 'running' });

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--lang=pt-BR,pt',
      ],
    });

    handle.cancel = () => {
      handle.cancelled = true;
      if (browser) {
        browser.close().catch(() => {});
      }
    };

    if (handle.cancelled) {
      await emitProgress('Coleta cancelada antes de iniciar navegação.', {
        status: 'stopped',
        status_message: 'Coleta interrompida pelo usuário.',
        completed_at: new Date().toISOString(),
      });
      return;
    }

    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      (window as any).__name = (f: any) => f;
      (globalThis as any).__name = (f: any) => f;
    });
    await page.setViewport({ width: 1366, height: 768 });
    const fullQuery = `${segment.trim()} ${location.trim()}`.trim();
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(fullQuery)}?hl=pt-BR`;

    await emitProgress(`Navegando no Google Maps para: "${fullQuery}"...`);

    try {
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForSelector('div[role="feed"], a[href*="/maps/place/"], div.Nv2PK', { timeout: 20000 }).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 1200));
    } catch (err: any) {
      // If network navigation failed
      throw new Error(`Falha ao carregar página de pesquisa do Google Maps: ${err.message}`);
    }

    if (handle.cancelled) {
      await emitProgress('Coleta interrompida pelo usuário.', {
        status: 'stopped',
        status_message: 'Coleta interrompida pelo usuário.',
        completed_at: new Date().toISOString(),
      });
      return;
    }

    // Check for CAPTCHA or blocking indicators
    const isBlocked = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return (
        text.includes('tráfego incomum') ||
        text.includes('unusual traffic') ||
        document.querySelector('iframe[src*="recaptcha"]') !== null ||
        document.querySelector('#captcha-form') !== null
      );
    });

    if (isBlocked) {
      await safeAudit({ level: 'error', category: 'scraper', event: 'maps.access_challenge', message: 'Google Maps exibiu verificação ou bloqueio; a coleta foi interrompida.', jobId, metadata: { pageUrl: page.url() } });
      await emitProgress('Bloqueio ou verificação detectada no Google Maps.', {
        status: 'failed',
        status_message: 'Google Maps exigiu verificação de tráfego. Coleta interrompida para cumprir regras de acesso.',
        completed_at: new Date().toISOString(),
      });
      return;
    }

    // Check if directly redirected to a place page (exact match)
    const currentUrl = page.url();
    if (currentUrl.includes('/maps/place/')) {
      await emitProgress('Resultado exato identificado. Coletando ficha...');
      totalFound = 1;

      const placeRecord = await extractPlaceDetails(page, jobId, currentUrl);
      const existingDirectPlace = await findPlaceByUrl(currentUrl);
      if (existingDirectPlace) {
        totalDuplicates = 1;
        await safeAudit({
          category: 'scraper',
          event: 'place.duplicate_skipped',
          message: 'Ficha direta já existe na base; nenhum registro novo foi criado.',
          jobId,
          metadata: { mapsUrl: currentUrl, previewName: placeRecord.name, existingPlaceId: existingDirectPlace.id, existingName: existingDirectPlace.name, existingJobId: existingDirectPlace.job_id, existingCollectedAt: existingDirectPlace.collected_at, reason: 'canonical_maps_url_exists' },
        });
      } else {
        await insertPlace(placeRecord);
        totalCollected = 1;
        await safeAudit({ category: 'scraper', event: 'place.saved', message: 'Ficha salva no SQLite.', jobId, metadata: { placeId: placeRecord.id, name: placeRecord.name, mapsUrl: placeRecord.maps_url, missingFields: missingFields(placeRecord) } });
      }

      const directStatus = totalCollected === 0 && totalDuplicates > 0 ? 'partial' : 'completed';
      const directMessage = totalCollected === 1
        ? 'Coleta concluída com sucesso (resultado único direto).'
        : 'A ficha encontrada já estava salva. Nenhum dado novo foi adicionado à base.';
      await safeAudit({ level: directStatus === 'partial' ? 'warn' : 'info', category: 'scraper', event: 'job.finished', message: directMessage, jobId, metadata: { status: directStatus, totalFound, totalCollected, totalDuplicates, totalErrors, databaseCountBefore: baselineCount } });
      await emitProgress('Coleta finalizada.', {
        status: directStatus,
        status_message: totalCollected === 1
          ? 'Coleta concluída com sucesso (resultado único direto).'
          : 'A ficha encontrada já estava salva. Nenhum dado novo foi adicionado à base.',
        completed_at: new Date().toISOString(),
      });
      return;
    }

    // Wait for feed container or results
    await emitProgress('Localizando lista de estabelecimentos...');

    try {
      await page.waitForSelector('div[role="feed"], a[href*="/maps/place/"], div.Nv2PK', {
        timeout: 15000,
      });
    } catch {
      // If no feed or place links found
      const pageText = await page.evaluate(() => document.body.innerText);
      if (pageText.includes('Nenhum resultado encontrado') || pageText.includes('não encontrou')) {
        await emitProgress('Nenhum estabelecimento encontrado para a pesquisa informada.', {
          status: 'completed',
          status_message: 'Nenhum resultado encontrado no Google Maps para o termo informado.',
          completed_at: new Date().toISOString(),
        });
        return;
      }
    }

    // Collect place items from feed with scrolling
    await emitProgress('Carregando resultados da lista...');

    // Keep scrolling until we have the requested number of NEW records, not merely links.
    const discoveredUrls: { url: string; previewName: string }[] = [];
    const seenUrlsInRun = new Set<string>();
    let duplicateUrlsDiscovered = 0;

    let scrollAttempts = 0;
    let stagnantRounds = 0;
    let reachedEndOfList = false;
    const maxScrollAttempts = Math.min(Math.max(limitRequested * 4, 40), 160);

    while (discoveredUrls.length < limitRequested && scrollAttempts < maxScrollAttempts && stagnantRounds < 8 && !handle.cancelled) {
      scrollAttempts++;

      // Extract current place links in the DOM
      const currentLinks = await page.evaluate((selectors) => {
        const links: { url: string; previewName: string }[] = [];
        try {
          const items = document.querySelectorAll(selectors.placeLinks.join(', '));
          items.forEach((item) => {
            const a = item as HTMLAnchorElement;
            const href = a.href;
            if (href && href.includes('/maps/place/')) {
              const previewName = a.getAttribute('aria-label') || a.innerText.trim() || '';
              links.push({ url: href, previewName });
            }
          });
        } catch {
          // Fallback to simple anchor query
          const anchors = document.querySelectorAll('a[href*="/maps/place/"]');
          anchors.forEach((a) => {
            const el = a as HTMLAnchorElement;
            links.push({
              url: el.href,
              previewName: el.getAttribute('aria-label') || el.innerText.trim() || '',
            });
          });
        }
        return links;
      }, SELECTORS.feed);

      let newFoundInBatch = 0;
      let newUniqueLinksInBatch = 0;
      for (const item of currentLinks) {
        const canonicalUrl = item.url.split('?')[0].replace(/\/$/, '');
        if (!canonicalUrl || seenUrlsInRun.has(canonicalUrl)) continue;
        seenUrlsInRun.add(canonicalUrl);
        newUniqueLinksInBatch++;

        // Count and log existing records during discovery, then continue scrolling
        // until the requested number of genuinely new candidates has been found.
        const existingPlace = await findPlaceByUrl(canonicalUrl);
        if (existingPlace) {
          totalDuplicates++;
          duplicateUrlsDiscovered++;
          await safeAudit({
            category: 'scraper',
            event: 'place.duplicate_skipped',
            message: 'Ficha já existe na base; ignorada durante a descoberta.',
            jobId,
            metadata: { mapsUrl: canonicalUrl, previewName: item.previewName || '', existingPlaceId: existingPlace.id, existingName: existingPlace.name, existingJobId: existingPlace.job_id, existingCollectedAt: existingPlace.collected_at, reason: 'canonical_maps_url_exists' },
          });
          continue;
        }

        discoveredUrls.push({ ...item, url: canonicalUrl });
        newFoundInBatch++;
      }

      totalFound = discoveredUrls.length + duplicateUrlsDiscovered;
      if (newFoundInBatch > 0) await safeAudit({ category: 'scraper', event: 'results.discovered', message: 'Novas fichas candidatas encontradas na lista.', jobId, metadata: { totalFound, newCandidates: discoveredUrls.length, newInBatch: newFoundInBatch, duplicatesSeen: duplicateUrlsDiscovered, scrollAttempt: scrollAttempts } });
      await emitProgress(`Encontrados ${totalFound} links únicos; ${discoveredUrls.length} ainda não estão salvos...`);

      if (discoveredUrls.length >= limitRequested) {
        break;
      }

      // Check if end of list reached
      const isEndOfList = await page.evaluate((selectors) => {
        for (const sel of selectors.endOfList) {
          try {
            if (document.querySelector(sel)) return true;
          } catch {
            // ignore selector error
          }
        }
        // Text fallback
        const text = document.body ? document.body.innerText : '';
        if (text.includes('Você chegou ao final da lista') || text.includes('fim da lista')) {
          return true;
        }
        return false;
      }, SELECTORS.feed);

      if (newUniqueLinksInBatch === 0) stagnantRounds++;
      else stagnantRounds = 0;

      if (isEndOfList && newUniqueLinksInBatch === 0) {
        reachedEndOfList = true;
        break;
      }

      // Scroll the actual Google Maps results pane. The list is virtualized, so
      // scrolling the wrong ancestor leaves the same first batch of links in the DOM.
      const scrollTarget = await page.evaluate(() => {
        const feed = document.querySelector('div[role="feed"]') as HTMLElement | null;
        if (!feed) return null;
        feed.scrollIntoView({ block: 'nearest' });
        const candidates = [feed, ...Array.from(feed.querySelectorAll('*'))] as HTMLElement[];
        const scrollable = candidates
          .filter((el) => el.clientHeight > 100 && el.scrollHeight > el.clientHeight + 20)
          .sort((a, b) => {
            const aCanScroll = a.scrollTop < a.scrollHeight - a.clientHeight - 2 ? 1 : 0;
            const bCanScroll = b.scrollTop < b.scrollHeight - b.clientHeight - 2 ? 1 : 0;
            if (aCanScroll !== bCanScroll) return bCanScroll - aCanScroll;
            return (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight);
          });
        const target = scrollable[0] || feed;
        const rect = target.getBoundingClientRect();
        return {
          x: Math.max(5, Math.min(window.innerWidth - 5, rect.left + rect.width / 2)),
          y: Math.max(5, Math.min(window.innerHeight - 5, rect.top + Math.min(rect.height / 2, 300))),
          beforeTop: target.scrollTop,
          maxTop: Math.max(0, target.scrollHeight - target.clientHeight),
          tag: target.tagName,
          className: String(target.className || '').slice(0, 120),
          feedLinks: feed.querySelectorAll('a[href*="/maps/place/"]').length,
        };
      });

      let scrollMoved = false;
      if (scrollTarget) {
        // Mouse wheel triggers Maps' own scroll handlers and works when the feed
        // uses a nested/virtualized scroll container.
        await page.mouse.move(scrollTarget.x, scrollTarget.y);
        await page.mouse.wheel({ deltaY: 650 });
        await new Promise((resolve) => setTimeout(resolve, 350));
        const wheelMoved = await page.evaluate((beforeTop) => {
          const feed = document.querySelector('div[role="feed"]') as HTMLElement | null;
          if (!feed) return false;
          const candidates = [feed, ...Array.from(feed.querySelectorAll('*'))] as HTMLElement[];
          const target = candidates
            .filter((el) => el.clientHeight > 100 && el.scrollHeight > el.clientHeight + 20)
            .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0] || feed;
          return Math.abs(target.scrollTop - beforeTop) > 2;
        }, scrollTarget.beforeTop);
        scrollMoved = wheelMoved;

        if (!scrollMoved) {
          await page.evaluate(() => {
            const feed = document.querySelector('div[role="feed"]') as HTMLElement | null;
            if (!feed) {
              window.scrollBy({ top: 650, behavior: 'auto' });
              return;
            }
            const candidates = [feed, ...Array.from(feed.querySelectorAll('*'))] as HTMLElement[];
            const target = candidates
              .filter((el) => el.clientHeight > 100 && el.scrollHeight > el.clientHeight + 20)
              .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0] || feed;
            target.scrollTop = Math.min(target.scrollHeight, target.scrollTop + Math.max(600, target.clientHeight * 0.8));
            target.dispatchEvent(new Event('scroll', { bubbles: true }));
          });
        }
      } else {
        await page.mouse.wheel({ deltaY: 650 });
      }

      // Give Maps time to append/recycle cards, then capture evidence that the
      // result pane is progressing rather than repeatedly exposing the first 20.
      await new Promise((resolve) => setTimeout(resolve, 1800));
      const scrollEvidence = await page.evaluate(() => {
        const feed = document.querySelector('div[role="feed"]') as HTMLElement | null;
        const links = Array.from(document.querySelectorAll('div[role="feed"] a[href*="/maps/place/"]'))
          .map((a) => (a as HTMLAnchorElement).href.split('?')[0].replace(/\/$/, ''));
        const unique = Array.from(new Set(links));
        const candidates = feed ? [feed, ...Array.from(feed.querySelectorAll('*'))] as HTMLElement[] : [];
        const target = candidates
          .filter((el) => el.clientHeight > 100 && el.scrollHeight > el.clientHeight + 20)
          .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0];
        return {
          scrollTop: target?.scrollTop ?? 0,
          scrollHeight: target?.scrollHeight ?? 0,
          clientHeight: target?.clientHeight ?? 0,
          visibleUniqueLinks: unique.length,
          firstUrl: unique[0] || '',
          lastUrl: unique[unique.length - 1] || '',
        };
      });
      await safeAudit({
        level: 'info',
        category: 'scraper',
        event: 'results.scroll',
        message: 'Rolagem da lista de resultados executada e medida.',
        jobId,
        metadata: { scrollAttempt: scrollAttempts, target: scrollTarget, evidence: scrollEvidence, moved: scrollMoved },
      });
      await page.waitForFunction(() => document.readyState === 'complete' || !!document.querySelector('div[role="feed"]'), { timeout: 2500 }).catch(() => {});
    }

    if (discoveredUrls.length === 0) {
      const noNewStatus = totalDuplicates > 0 ? 'partial' : 'completed';
      const noNewMessage = totalDuplicates > 0
        ? `Nenhum dado novo foi salvo. ${totalDuplicates} fichas já existentes foram ignoradas; a base não cresceu nesta execução.`
        : 'Nenhum resultado visível na página pública do Google Maps.';
      await safeAudit({ level: totalDuplicates > 0 ? 'warn' : 'info', category: 'scraper', event: 'job.finished', message: noNewMessage, jobId, metadata: { status: noNewStatus, totalFound, totalCollected, totalDuplicates, totalErrors, scrollAttempts, reachedEndOfList, databaseCountBefore: baselineCount } });
      await emitProgress(noNewMessage, {
        status: noNewStatus,
        status_message: noNewMessage,
        completed_at: new Date().toISOString(),
      });
      return;
    }

    const itemsToProcess = discoveredUrls.slice(0, limitRequested);
    totalFound = Math.max(totalFound, itemsToProcess.length + duplicateUrlsDiscovered);

    await emitProgress(
      `Iniciando extração detalhada de ${itemsToProcess.length} fichas de estabelecimentos...`
    );

    // Visit each place and extract fields
    for (let i = 0; i < itemsToProcess.length; i++) {
      if (handle.cancelled) {
        await emitProgress('Coleta interrompida pelo usuário.', {
          status: 'stopped',
          status_message: `Coleta interrompida pelo usuário. ${totalCollected} estabelecimentos foram salvos no SQLite.`,
          completed_at: new Date().toISOString(),
        });
        return;
      }

      const item = itemsToProcess[i];
      const placeNum = i + 1;
      const previewTitle = item.previewName || `Estabelecimento #${placeNum}`;

      // Deduplication check in SQLite
      const existingPlace = await findPlaceByUrl(item.url);
      if (existingPlace) {
        totalDuplicates++;
        await safeAudit({ category: 'scraper', event: 'place.duplicate_skipped', message: 'Ficha já existe no momento da persistência; ignorada para evitar duplicação.', jobId, metadata: { mapsUrl: item.url, previewName: item.previewName || previewTitle, existingPlaceId: existingPlace.id, existingName: existingPlace.name, existingJobId: existingPlace.job_id, existingCollectedAt: existingPlace.collected_at, reason: 'duplicate_detected_before_insert' } });
        await emitProgress(
          `[${placeNum}/${itemsToProcess.length}] Duplicado ignorado: ${previewTitle}`
        );
        continue;
      }

      await emitProgress(
        `[${placeNum}/${itemsToProcess.length}] Extraindo ficha: ${previewTitle}...`
      );

      try {
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait for the place title without requiring the Maps network to become idle.
        await page.waitForSelector('h1', { timeout: 12000 }).catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 700));

        const placeRecord = await extractPlaceDetails(page, jobId, item.url);

        // Fallback for name if h1 was blank
        if (!placeRecord.name && item.previewName) {
          placeRecord.name = item.previewName;
        }

        // Persist immediately to SQLite
        await insertPlace(placeRecord);
        totalCollected++;
        await safeAudit({ category: 'scraper', event: 'place.saved', message: 'Ficha salva no SQLite.', jobId, metadata: { placeId: placeRecord.id, name: placeRecord.name, mapsUrl: placeRecord.maps_url, missingFields: missingFields(placeRecord) } });

        await emitProgress(
          `[${placeNum}/${itemsToProcess.length}] Coletado: ${placeRecord.name}`
        );
      } catch (placeErr: any) {
        totalErrors++;
        await safeAudit({ level: 'error', category: 'scraper', event: 'place.extraction_failed', message: placeErr?.message || 'Falha ao extrair ficha.', jobId, metadata: { mapsUrl: item.url, previewName: item.previewName || previewTitle, stack: String(placeErr?.stack || '').slice(0, 4000) } }).catch(() => {});
        console.error(`Erro ao coletar ficha ${item.url}:`, placeErr.message);
        await emitProgress(
          `[${placeNum}/${itemsToProcess.length}] Erro na ficha: ${placeErr.message}`
        );
      }

      // Polite pause between requests to prevent rate limits
      await new Promise((r) => setTimeout(r, 600));
    }

    const hadPartialFailures = totalErrors > 0 || (discoveredUrls.length < limitRequested && !reachedEndOfList) || (totalCollected === 0 && totalDuplicates > 0);
    const finalStatus = handle.cancelled ? 'stopped' : hadPartialFailures ? 'partial' : 'completed';
    const statusMsg = handle.cancelled
      ? `Coleta interrompida. ${totalCollected} registros salvos; ${totalErrors} falhas.`
      : hadPartialFailures
        ? `Coleta encerrada parcialmente: ${totalCollected} registros salvos, ${totalDuplicates} duplicados, ${totalErrors} falhas. Foram encontrados ${discoveredUrls.length} resultados para um limite de ${limitRequested}; isso não comprova que não existam outros resultados.`
        : `Coleta concluída: ${totalCollected} registros salvos, ${totalDuplicates} duplicados e ${totalErrors} falhas.`;

    await safeAudit({ level: finalStatus === 'partial' ? 'warn' : 'info', category: 'scraper', event: 'job.finished', message: statusMsg, jobId, metadata: { status: finalStatus, totalFound, totalCollected, totalDuplicates, totalErrors, scrollAttempts, reachedEndOfList, databaseCountBefore: baselineCount, newCandidatesFound: discoveredUrls.length } });
    await emitProgress(statusMsg, {
      status: finalStatus,
      status_message: statusMsg,
      completed_at: new Date().toISOString(),
    });
  } catch (error: any) {
    const errMsg = error.message || 'Erro inesperado durante a coleta.';
    await safeAudit({ level: handle.cancelled ? 'warn' : 'error', category: 'scraper', event: handle.cancelled ? 'job.stopped' : 'job.failed', message: errMsg, jobId, metadata: { stack: String(error?.stack || '').slice(0, 5000), totalFound, totalCollected, totalDuplicates, totalErrors } }).catch(() => {});
    console.error('Scraper fatal error:', error);
    if (handle.cancelled) {
      await emitProgress('Coleta interrompida pelo usuário.', {
        status: 'stopped',
        status_message: `Coleta interrompida. ${totalCollected} registros salvos antes do encerramento.`,
        completed_at: new Date().toISOString(),
      });
    } else {
      totalErrors++;
      await emitProgress(`Erro na coleta: ${errMsg}`, {
        status: 'failed',
        status_message: errMsg,
        completed_at: new Date().toISOString(),
      });
    }
  } finally {
    activeJobs.delete(jobId);
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
    try {
      const reportPath = await writeRunReport(jobId, baselineCount);
      await safeAudit({ category: 'scraper', event: 'job.report_written', message: 'Relatório JSON de evidências gerado.', jobId, metadata: { reportPath, databaseCountBefore: baselineCount } });
    } catch (reportError: any) {
      await safeAudit({ level: 'error', category: 'scraper', event: 'job.report_write_failed', message: reportError?.message || 'Não foi possível gerar relatório JSON.', jobId, metadata: { stack: String(reportError?.stack || '').slice(0, 3000) } });
    }
  }
}
