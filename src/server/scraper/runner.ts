import puppeteer, { Browser, Page } from 'puppeteer';
import { PlaceRecord, ScrapeJob } from '../../shared/types';
import { getJob, updateJobProgress, insertPlace, updatePlace, findPlaceByUrl, countPlaces, getLastCollectedPlaceForSearch } from '../db';
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

async function connectScraperBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    const { getBrowserWSEndpoint, getBrowserEndpointDiagnostic } = await import('../browserless-endpoint');
    const endpoint = getBrowserWSEndpoint();
    try {
      return await puppeteer.connect({ browserWSEndpoint: endpoint, protocolTimeout: 60000 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'falha desconhecida';
      throw new Error(`Falha ao conectar ao Chromium remoto. Diagnóstico seguro do endpoint: ${JSON.stringify(getBrowserEndpointDiagnostic(endpoint))}. Erro Puppeteer: ${message}`);
    }
  }
  return puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--lang=pt-BR,pt'],
  });
}

function isTransientBrowserError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /connection closed|target closed|detached frame|session closed|websocket is not open|protocol error|browser has disconnected|cannot find context/i.test(message);
}

function isBrowserConnected(browser: Browser): boolean {
  const compatible = browser as Browser & { connected?: boolean; isConnected?: () => boolean };
  if (typeof compatible.isConnected === 'function') return compatible.isConnected();
  return compatible.connected !== false;
}

function missingFields(place: PlaceRecord): string[] {
  const fields: (keyof PlaceRecord)[] = ['name', 'category', 'address', 'phone', 'website', 'rating', 'review_count', 'price_range', 'opening_hours', 'business_status', 'latitude', 'longitude', 'maps_url', 'description', 'services_attributes', 'photos', 'videos', 'logo_url', 'social_links', 'reviews', 'review_topics', 'additional_attributes', 'media_items', 'plus_code', 'collected_at'];
  return fields.filter((field) => {
    const value = String(place[field] ?? '').trim();
    if (!value) return true;
    if (field === 'reviews' || field === 'review_topics' || field === 'media_items') {
      try { const parsed = JSON.parse(value); return !Array.isArray(parsed) || parsed.length === 0; } catch { return true; }
    }
    if (field === 'additional_attributes') {
      try {
        const parsed = JSON.parse(value) as { about_text?: string; sections?: unknown[]; labeled_attributes?: unknown[] };
        return !parsed.about_text?.trim() && !(parsed.sections?.length) && !(parsed.labeled_attributes?.length);
      } catch { return true; }
    }
    return false;
  });
}


const ENRICHMENT_FIELDS: (keyof PlaceRecord)[] = [
  'review_count', 'opening_hours', 'reviews', 'review_topics', 'additional_attributes', 'media_items',
];

function needsEnrichment(place: PlaceRecord): boolean {
  const missing = missingFields(place);
  return ENRICHMENT_FIELDS.some((field) => missing.includes(field));
}

function parseJsonArray(value?: string): any[] {
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function parseJsonObject(value?: string): Record<string, any> {
  try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}

function mergeDelimited(oldValue?: string, newValue?: string): string {
  return Array.from(new Set([...(oldValue || '').split(' | '), ...(newValue || '').split(' | ')]
    .map((value) => value.trim()).filter(Boolean))).join(' | ');
}

/** Preserve existing facts when the new public page does not expose a value. */
function mergePlaceRecords(existing: PlaceRecord, fresh: PlaceRecord): PlaceRecord {
  const freshReviews = parseJsonArray(fresh.reviews);
  const oldReviews = parseJsonArray(existing.reviews);
  const freshTopics = parseJsonArray(fresh.review_topics);
  const oldTopics = parseJsonArray(existing.review_topics);
  const freshMedia = parseJsonArray(fresh.media_items);
  const oldMedia = parseJsonArray(existing.media_items);
  const freshAttributes = parseJsonObject(fresh.additional_attributes);
  const oldAttributes = parseJsonObject(existing.additional_attributes);
  const hasFreshAttributes = Boolean(freshAttributes.about_text?.trim() || freshAttributes.sections?.length || freshAttributes.labeled_attributes?.length);

  return {
    ...existing,
    ...fresh,
    id: existing.id,
    job_id: existing.job_id,
    name: fresh.name || existing.name,
    category: fresh.category || existing.category,
    address: fresh.address || existing.address,
    phone: fresh.phone || existing.phone,
    website: fresh.website || existing.website,
    rating: fresh.rating || existing.rating,
    review_count: fresh.review_count || existing.review_count,
    price_range: fresh.price_range || existing.price_range,
    opening_hours: fresh.opening_hours || existing.opening_hours,
    business_status: fresh.business_status || existing.business_status,
    latitude: fresh.latitude || existing.latitude,
    longitude: fresh.longitude || existing.longitude,
    maps_url: fresh.maps_url || existing.maps_url,
    description: fresh.description || existing.description,
    services_attributes: fresh.services_attributes || existing.services_attributes,
    photos: mergeDelimited(existing.photos, fresh.photos),
    videos: mergeDelimited(existing.videos, fresh.videos),
    logo_url: fresh.logo_url || existing.logo_url,
    social_links: mergeDelimited(existing.social_links, fresh.social_links),
    reviews: JSON.stringify(freshReviews.length ? freshReviews : oldReviews),
    review_topics: JSON.stringify(freshTopics.length ? freshTopics : oldTopics),
    additional_attributes: JSON.stringify(hasFreshAttributes ? freshAttributes : oldAttributes),
    media_items: JSON.stringify(freshMedia.length ? freshMedia : oldMedia),
    plus_code: fresh.plus_code || existing.plus_code,
    collected_at: fresh.collected_at || existing.collected_at || new Date().toISOString(),
  };
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
  const connectAndTrackBrowser = async (): Promise<Browser> => {
    const connectedBrowser = await connectScraperBrowser();
    browser = connectedBrowser;
    connectedBrowser.on('disconnected', () => {
      if (browser === connectedBrowser) browser = null;
    });
    return connectedBrowser;
  };
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
    // Progress persistence must not abort the scraping loop. Each place is
    // persisted independently; transient status-update failures are logged and
    // the next item still gets processed.
    try {
      await updateJobProgress(jobId, jobUpdates);
      if (onProgress) {
        const current = await getJob(jobId);
        if (current) onProgress(current);
      }
    } catch (progressError) {
      console.error('Falha ao atualizar progresso; a coleta continuará:', progressError instanceof Error ? progressError.message : progressError);
      await safeAudit({
        level: 'error',
        category: 'scraper',
        event: 'job.progress_update_failed',
        message: progressError instanceof Error ? progressError.message : 'Falha ao persistir progresso.',
        jobId,
        metadata: { step: step.slice(0, 200), status: updates.status || 'running' },
      });
    }
  };

  try {
    baselineCount = await countPlaces();
    await safeAudit({ category: 'scraper', event: 'job.browser_start', message: 'Inicializando Chromium.', jobId, metadata: { segment, location, limitRequested, databaseCountBefore: baselineCount } });
    await emitProgress('Iniciando navegador Chromium...', { status: 'running' });

    await connectAndTrackBrowser();

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
    await page.emulateLocale('pt-BR');
    await page.emulateTimezone('America/Sao_Paulo');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' });
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
      if (!placeRecord.name.trim()) {
        throw new Error('A ficha direta abriu sem nome identificável; registro não salvo.');
      }
      if (!placeRecord.maps_url.includes('/maps/place/')) {
        placeRecord.maps_url = currentUrl;
      }
      const existingDirectPlace = await findPlaceByUrl(currentUrl);
      if (existingDirectPlace) {
        if (needsEnrichment(existingDirectPlace)) {
          const merged = mergePlaceRecords(existingDirectPlace, placeRecord);
          await updatePlace(existingDirectPlace.id, merged);
          totalCollected = 1;
          await safeAudit({
            category: 'scraper',
            event: 'place.enriched',
            message: 'Ficha direta existente atualizada com campos públicos adicionais.',
            jobId,
            metadata: { placeId: existingDirectPlace.id, name: merged.name, reviewsCaptured: parseJsonArray(placeRecord.reviews).length, topicsCaptured: parseJsonArray(placeRecord.review_topics).length, mediaCaptured: parseJsonArray(placeRecord.media_items).length, missingFields: missingFields(merged) },
          });
        } else {
          totalDuplicates = 1;
          await safeAudit({
            category: 'scraper',
            event: 'place.duplicate_skipped',
            message: 'Ficha direta já existe e os campos de enriquecimento estão preenchidos; ignorada.',
            jobId,
            metadata: { mapsUrl: currentUrl, previewName: placeRecord.name, existingPlaceId: existingDirectPlace.id, existingName: existingDirectPlace.name, existingJobId: existingDirectPlace.job_id, existingCollectedAt: existingDirectPlace.collected_at, reason: 'duplicate_already_enriched' },
          });
        }
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

    // Stop after evaluating at most the requested number of unique result URLs.
    const discoveredUrls: { url: string; previewName: string }[] = [];
    const seenUrlsInRun = new Set<string>();
    const eligibleUrlsInRun = new Set<string>();
    const retriedItems = new Set<number>();
    let duplicateUrlsDiscovered = 0;

    // Resume at the most recently saved URL for this exact segment/location pair.
    // Maps does not expose page offsets, so the feed must scroll until the checkpoint
    // reappears; older results are ignored without per-place database lookups/log spam.
    const resumeRecord = await getLastCollectedPlaceForSearch(segment, location);
    const resumeUrl = resumeRecord?.maps_url
      ? resumeRecord.maps_url.split('?')[0].replace(/\/$/, '')
      : '';
    let resumeReached = !resumeUrl;
    let resumeFallbackUsed = false;

    let scrollAttempts = 0;
    let stagnantRounds = 0;
    let reachedEndOfList = false;
    const maxScrollAttempts = Math.min(Math.max(limitRequested * 4, 40), 160);

    while (eligibleUrlsInRun.size < limitRequested && scrollAttempts < maxScrollAttempts && stagnantRounds < 8 && !handle.cancelled) {
      scrollAttempts++;

      // Search ordering can change. Give deep histories time to reach the checkpoint;
      // if it is still absent, restart candidate evaluation on the current feed and
      // rely on global URL deduplication instead of silently returning zero results.
      if (!resumeReached && scrollAttempts >= Math.min(maxScrollAttempts, 40)) {
        resumeReached = true;
        resumeFallbackUsed = true;
        seenUrlsInRun.clear();
        stagnantRounds = 0;
        await safeAudit({
          level: 'warn', category: 'scraper', event: 'results.resume_checkpoint_missing',
          message: 'O último resultado salvo não reapareceu após 40 rolagens; retomada por checkpoint desativada e deduplicação global aplicada.',
          jobId, metadata: { checkpointUrl: resumeUrl, scrollAttempts },
        });
      }

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

        // Ignore prior results up to the saved checkpoint. Once resumed, count each
        // unique candidate against the requested limit, including duplicates.
        if (!resumeReached) {
          if (canonicalUrl === resumeUrl) {
            resumeReached = true;
            await safeAudit({
              category: 'scraper', event: 'results.resume_checkpoint_reached',
              message: 'Retomada alcançou a última ficha salva para esta pesquisa.',
              jobId, metadata: { checkpointUrl: resumeUrl, checkpointName: resumeRecord?.name || '', scrollAttempt: scrollAttempts },
            });
          }
          continue;
        }

        if (eligibleUrlsInRun.size >= limitRequested) continue;
        eligibleUrlsInRun.add(canonicalUrl);

        // Existing records consume one of the requested result slots and are counted as duplicates.
        const existingPlace = await findPlaceByUrl(canonicalUrl);
        if (existingPlace) {
          if (needsEnrichment(existingPlace)) {
            // Include incomplete legacy records in the detail-processing queue
            // so the UI can refresh them rather than silently skipping them.
            discoveredUrls.push({ ...item, url: canonicalUrl, previewName: existingPlace.name || item.previewName });
            newFoundInBatch++;
            await safeAudit({
              category: 'scraper',
              event: 'place.enrichment_candidate',
              message: 'Ficha existente tem campos de avaliação/mídia incompletos; será reprocessada.',
              jobId,
              metadata: { mapsUrl: canonicalUrl, existingPlaceId: existingPlace.id, existingName: existingPlace.name, missingFields: missingFields(existingPlace) },
            });
            continue;
          }
          totalDuplicates++;
          duplicateUrlsDiscovered++;
          await safeAudit({
            category: 'scraper',
            event: 'place.duplicate_skipped',
            message: 'Ficha já existe e os campos de enriquecimento estão preenchidos; ignorada durante a descoberta.',
            jobId,
            metadata: { mapsUrl: canonicalUrl, previewName: item.previewName || '', existingPlaceId: existingPlace.id, existingName: existingPlace.name, existingJobId: existingPlace.job_id, existingCollectedAt: existingPlace.collected_at, reason: 'duplicate_already_enriched' },
          });
          continue;
        }

        discoveredUrls.push({ ...item, url: canonicalUrl });
        newFoundInBatch++;
      }

      totalFound = eligibleUrlsInRun.size;
      if (newFoundInBatch > 0) await safeAudit({ category: 'scraper', event: 'results.discovered', message: 'Novas fichas candidatas encontradas na lista.', jobId, metadata: { totalFound, newCandidates: discoveredUrls.length, newInBatch: newFoundInBatch, duplicatesSeen: duplicateUrlsDiscovered, scrollAttempt: scrollAttempts } });
      await emitProgress(`Limite: ${limitRequested} fichas. Avaliadas ${totalFound}; elegíveis para extração ${discoveredUrls.length}; duplicados ${duplicateUrlsDiscovered}.`);

      if (eligibleUrlsInRun.size >= limitRequested) {
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

      if (newUniqueLinksInBatch === 0 && resumeReached) stagnantRounds++;
      else if (newUniqueLinksInBatch > 0) stagnantRounds = 0;

      if (isEndOfList && newUniqueLinksInBatch === 0) {
        if (!resumeReached) {
          // The checkpoint may have disappeared because Maps reordered/limited results.
          // Re-evaluate the currently visible URLs in normal dedupe mode before ending.
          resumeReached = true;
          resumeFallbackUsed = true;
          seenUrlsInRun.clear();
          stagnantRounds = 0;
          await safeAudit({
            level: 'warn', category: 'scraper', event: 'results.resume_checkpoint_missing',
            message: 'A lista terminou antes de reencontrar o ponto salvo; reavaliando resultados com deduplicação global.',
            jobId, metadata: { checkpointUrl: resumeUrl, scrollAttempts },
          });
          continue;
        }
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
        await page.mouse.wheel({ deltaY: resumeReached ? 650 : 1300 });
        await new Promise((resolve) => setTimeout(resolve, 350));
        const wheelMoved = await page.evaluate((beforeTop) => {
          const feed = document.querySelector('div[role="feed"]') as HTMLElement | null;
          if (!feed) return false;
          const candidates = [feed, ...Array.from(feed.querySelectorAll('*'))] as HTMLElement[];
          const target = candidates
            .filter((el) => el.clientHeight > 100 && el.scrollHeight > el.clientHeight + 20)
            .sort((a, b) => {
              const aCanScroll = a.scrollTop < a.scrollHeight - a.clientHeight - 2 ? 1 : 0;
              const bCanScroll = b.scrollTop < b.scrollHeight - b.clientHeight - 2 ? 1 : 0;
              if (aCanScroll !== bCanScroll) return bCanScroll - aCanScroll;
              return (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight);
            })[0] || feed;
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
              .sort((a, b) => {
              const aCanScroll = a.scrollTop < a.scrollHeight - a.clientHeight - 2 ? 1 : 0;
              const bCanScroll = b.scrollTop < b.scrollHeight - b.clientHeight - 2 ? 1 : 0;
              if (aCanScroll !== bCanScroll) return bCanScroll - aCanScroll;
              return (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight);
            })[0] || feed;
            target.scrollTop = Math.min(target.scrollHeight, target.scrollTop + Math.max(600, target.clientHeight * 0.8));
            target.dispatchEvent(new Event('scroll', { bubbles: true }));
          });
        }
      } else {
        await page.mouse.wheel({ deltaY: 650 });
      }

      // Wait for a result URL that was not in any earlier batch. Merely waiting
      // for the feed element is insufficient: it already exists when scrolling fails.
      const knownUrls = Array.from(seenUrlsInRun);
      await page.waitForFunction((known) => {
        const anchors = Array.from(document.querySelectorAll('a[href*="/maps/place/"]')) as HTMLAnchorElement[];
        return anchors.some((a) => {
          const url = a.href.split('?')[0].replace(/\/$/, '');
          return url && !known.includes(url);
        });
      }, { timeout: 3000 }, knownUrls).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 500));
      const scrollEvidence = await page.evaluate(() => {
        const feed = document.querySelector('div[role="feed"]') as HTMLElement | null;
        const links = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'))
          .map((a) => (a as HTMLAnchorElement).href.split('?')[0].replace(/\/$/, ''));
        const unique = Array.from(new Set(links));
        const candidates = feed ? [feed, ...Array.from(feed.querySelectorAll('*'))] as HTMLElement[] : [];
        const target = candidates
          .filter((el) => el.clientHeight > 100 && el.scrollHeight > el.clientHeight + 20)
          .sort((a, b) => {
              const aCanScroll = a.scrollTop < a.scrollHeight - a.clientHeight - 2 ? 1 : 0;
              const bCanScroll = b.scrollTop < b.scrollHeight - b.clientHeight - 2 ? 1 : 0;
              if (aCanScroll !== bCanScroll) return bCanScroll - aCanScroll;
              return (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight);
            })[0];
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
        metadata: { scrollAttempt: scrollAttempts, target: scrollTarget, evidence: scrollEvidence, moved: scrollTarget ? Math.abs(scrollEvidence.scrollTop - scrollTarget.beforeTop) > 2 : scrollMoved, resumeCheckpoint: resumeUrl || null, resumeReached, resumeFallbackUsed },
      });
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
    totalFound = Math.min(eligibleUrlsInRun.size, limitRequested);

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
      let detailPage: Page | null = null;

      try {
        // Recover a lost remote session before opening the next detail tab.
        if (!browser || !isBrowserConnected(browser)) await connectAndTrackBrowser();

        // Keep every per-place operation inside the isolation boundary: a
        // database lookup or progress update can fail just like extraction.
        const existingPlace = await findPlaceByUrl(item.url);
        if (existingPlace) {
          if (needsEnrichment(existingPlace)) {
            await emitProgress(`[${placeNum}/${itemsToProcess.length}] Atualizando ficha existente: ${existingPlace.name}...`);
            detailPage = await browser!.newPage();
            await detailPage.emulateLocale('pt-BR');
            await detailPage.emulateTimezone('America/Sao_Paulo');
            await detailPage.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' });
            await detailPage.setViewport({ width: 1366, height: 768 });
            await detailPage.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await detailPage.waitForSelector('h1', { timeout: 12000 }).catch(() => {});
            await new Promise((resolve) => setTimeout(resolve, 700));
            // A failed extraction is not a valid enrichment. Keep the old record unchanged
            // and let the outer handler retry transient browser failures or record the failure.
            const fresh: PlaceRecord = await extractPlaceDetails(detailPage, jobId, item.url);
            if (!fresh.name.trim()) fresh.name = existingPlace.name || item.previewName;
            const merged = mergePlaceRecords(existingPlace, fresh);
            await updatePlace(existingPlace.id, merged);
            totalCollected++;
            await safeAudit({
              category: 'scraper',
              event: 'place.enriched',
              message: 'Ficha existente atualizada com campos públicos adicionais.',
              jobId,
              metadata: { placeId: existingPlace.id, name: merged.name, reviewCount: merged.review_count, reviewsCaptured: parseJsonArray(fresh.reviews).length, topicsCaptured: parseJsonArray(fresh.review_topics).length, mediaCaptured: parseJsonArray(fresh.media_items).length, missingFields: missingFields(merged) },
            });
            await emitProgress(`[${placeNum}/${itemsToProcess.length}] Ficha enriquecida: ${merged.name}`);
            continue;
          }
          totalDuplicates++;
          await safeAudit({ category: 'scraper', event: 'place.duplicate_skipped', message: 'Ficha já existe e os campos de enriquecimento estão preenchidos; ignorada.', jobId, metadata: { mapsUrl: item.url, previewName: item.previewName || previewTitle, existingPlaceId: existingPlace.id, existingName: existingPlace.name, existingJobId: existingPlace.job_id, existingCollectedAt: existingPlace.collected_at, reason: 'duplicate_already_enriched' } });
          await emitProgress(`[${placeNum}/${itemsToProcess.length}] Duplicado ignorado: ${previewTitle}`);
          continue;
        }

        await emitProgress(
          `[${placeNum}/${itemsToProcess.length}] Extraindo ficha: ${previewTitle}...`
        );

        // Keep the search tab isolated from Google Maps detail-page navigation.
        detailPage = await browser!.newPage();
        await detailPage.emulateLocale('pt-BR');
        await detailPage.emulateTimezone('America/Sao_Paulo');
        await detailPage.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' });
        await detailPage.setViewport({ width: 1366, height: 768 });
        await detailPage.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait for the place title without requiring the Maps network to become idle.
        await detailPage.waitForSelector('h1', { timeout: 12000 }).catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 700));

        // Do not convert an extraction exception into a synthetic record with blank fields.
        // Only persist a record when the extractor completed and returned a structured result.
        const placeRecord: PlaceRecord = await extractPlaceDetails(detailPage, jobId, item.url);

        // Reject structurally broken detail pages rather than persisting a blank
        // or unrelated record after a Google Maps UI change.
        // Fallback for name if h1 was blank
        if (!placeRecord.name && item.previewName) {
          placeRecord.name = item.previewName;
        }
        if (!placeRecord.name.trim()) {
          throw new Error('A ficha abriu, mas o nome do estabelecimento não foi identificado; registro não salvo.');
        }
        if (!placeRecord.maps_url.includes('/maps/place/')) {
          placeRecord.maps_url = item.url;
        }

        // Persist immediately to SQLite
        await insertPlace(placeRecord);
        totalCollected++;
        await safeAudit({ category: 'scraper', event: 'place.saved', message: 'Ficha salva no SQLite.', jobId, metadata: { placeId: placeRecord.id, name: placeRecord.name, mapsUrl: placeRecord.maps_url, missingFields: missingFields(placeRecord) } });

        await emitProgress(
          `[${placeNum}/${itemsToProcess.length}] Coletado: ${placeRecord.name}`
        );
      } catch (placeErr: any) {
        if (isTransientBrowserError(placeErr) && !retriedItems.has(i)) {
          retriedItems.add(i);
          await safeAudit({ level: 'warn', category: 'scraper', event: 'browser.transient_failure_retry', message: 'Falha transitória do Chromium; reconectando e repetindo esta ficha uma única vez.', jobId, metadata: { mapsUrl: item.url, attempt: 2, error: placeErr?.message || String(placeErr) } });
          try {
            await connectAndTrackBrowser();
            i--;
            continue;
          } catch (reconnectError) {
            placeErr = reconnectError;
          }
        }
        totalErrors++;
        await safeAudit({ level: 'error', category: 'scraper', event: 'place.extraction_failed', message: placeErr?.message || 'Falha ao extrair ficha.', jobId, metadata: { mapsUrl: item.url, previewName: item.previewName || previewTitle, stack: String(placeErr?.stack || '').slice(0, 4000) } }).catch(() => {});
        console.error(`Erro ao coletar ficha ${item.url}:`, placeErr.message);
        // Reporting the error must not turn an isolated place failure into
        // a fatal job failure.
        try {
          await emitProgress(
            `[${placeNum}/${itemsToProcess.length}] Erro na ficha: ${placeErr?.message || 'falha desconhecida'}`
          );
        } catch (progressError) {
          console.error('Falha ao reportar erro de ficha; continuando coleta:', progressError);
        }
      } finally {
        if (detailPage) {
          try { await detailPage.close(); } catch { /* The remote target may already be closed. */ }
        }
      }

      // Polite pause between requests to prevent rate limits
      await new Promise((r) => setTimeout(r, 600));
    }

    const hadPartialFailures = totalErrors > 0 || (eligibleUrlsInRun.size < limitRequested && !reachedEndOfList) || (totalCollected === 0 && totalDuplicates > 0);
    const finalStatus = handle.cancelled ? 'stopped' : hadPartialFailures ? 'partial' : 'completed';
    const statusMsg = handle.cancelled
      ? `Coleta interrompida. ${totalCollected} registros salvos; ${totalErrors} falhas.`
      : hadPartialFailures
        ? `Coleta encerrada parcialmente: ${totalCollected} registros salvos, ${totalDuplicates} duplicados, ${totalErrors} falhas. Foram avaliadas ${Math.min(eligibleUrlsInRun.size, limitRequested)} fichas, dentro do limite solicitado de ${limitRequested}; isso não comprova que não existam outros resultados.`
        : `Coleta concluída: ${totalCollected} registros salvos, ${totalDuplicates} duplicados e ${totalErrors} falhas.`;

    await safeAudit({ level: finalStatus === 'partial' ? 'warn' : 'info', category: 'scraper', event: 'job.finished', message: statusMsg, jobId, metadata: { status: finalStatus, totalFound, totalCollected, totalDuplicates, totalErrors, scrollAttempts, reachedEndOfList, databaseCountBefore: baselineCount, newCandidatesFound: discoveredUrls.length, eligibleCandidatesEvaluated: eligibleUrlsInRun.size, requestedLimit: limitRequested } });
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
