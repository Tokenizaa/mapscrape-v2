import puppeteer, { Browser, Page } from 'puppeteer';
import { PlaceRecord, ScrapeJob } from '../../shared/types';
import { getJob, updateJobProgress, insertPlace, placeExistsByUrl } from '../db';
import { extractPlaceDetails } from './extractor';
import { SELECTORS } from './selectors';

interface ActiveJobHandle {
  cancelled: boolean;
  cancel: () => void;
}

const activeJobs = new Map<string, ActiveJobHandle>();

export function isJobRunning(jobId: string): boolean {
  return activeJobs.has(jobId);
}

export function stopScrapeJob(jobId: string): boolean {
  const handle = activeJobs.get(jobId);
  if (handle) {
    handle.cancelled = true;
    handle.cancel();
    activeJobs.delete(jobId);
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
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    const fullQuery = `${segment.trim()} ${location.trim()}`.trim();
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(fullQuery)}?hl=pt-BR`;

    await emitProgress(`Navegando no Google Maps para: "${fullQuery}"...`);

    try {
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 35000 });
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
      await insertPlace(placeRecord);
      totalCollected = 1;

      await emitProgress('Coleta concluída com sucesso.', {
        status: 'completed',
        status_message: 'Coleta concluída com sucesso (resultado único direto).',
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

    const discoveredUrls: { url: string; previewName: string }[] = [];
    const seenUrlsInRun = new Set<string>();

    let scrollAttempts = 0;
    const maxScrollAttempts = Math.min(Math.ceil(limitRequested / 3) + 5, 25);

    while (discoveredUrls.length < limitRequested && scrollAttempts < maxScrollAttempts && !handle.cancelled) {
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
      for (const item of currentLinks) {
        // Canonicalize URL to ignore session tokens
        const canonicalUrl = item.url.split('?')[0];
        if (!seenUrlsInRun.has(canonicalUrl)) {
          seenUrlsInRun.add(canonicalUrl);
          discoveredUrls.push(item);
          newFoundInBatch++;
        }
      }

      totalFound = discoveredUrls.length;
      await emitProgress(`Encontrados ${totalFound} estabelecimentos no feed...`);

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

      if (isEndOfList && newFoundInBatch === 0) {
        break;
      }

      // Scroll feed container
      await page.evaluate((selectors) => {
        for (const sel of selectors.container) {
          try {
            const container = document.querySelector(sel);
            if (container) {
              container.scrollTop = container.scrollHeight;
              return;
            }
          } catch {}
        }
        window.scrollBy(0, 1000);
      }, SELECTORS.feed);

      await new Promise((r) => setTimeout(r, 1500));
    }

    if (discoveredUrls.length === 0) {
      await emitProgress('Nenhum estabelecimento encontrado nesta região.', {
        status: 'completed',
        status_message: 'Nenhum resultado visível na página pública do Google Maps.',
        completed_at: new Date().toISOString(),
      });
      return;
    }

    const itemsToProcess = discoveredUrls.slice(0, limitRequested);
    totalFound = itemsToProcess.length;

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
      const alreadyInDb = await placeExistsByUrl(item.url, jobId);
      if (alreadyInDb) {
        totalDuplicates++;
        await emitProgress(
          `[${placeNum}/${itemsToProcess.length}] Duplicado ignorado: ${previewTitle}`
        );
        continue;
      }

      await emitProgress(
        `[${placeNum}/${itemsToProcess.length}] Extraindo ficha: ${previewTitle}...`
      );

      try {
        await page.goto(item.url, { waitUntil: 'networkidle2', timeout: 25000 });

        // Wait a brief moment for dynamic card elements
        await page.waitForSelector('h1', { timeout: 8000 }).catch(() => {});

        const placeRecord = await extractPlaceDetails(page, jobId, item.url);

        // Fallback for name if h1 was blank
        if (!placeRecord.name && item.previewName) {
          placeRecord.name = item.previewName;
        }

        // Persist immediately to SQLite
        await insertPlace(placeRecord);
        totalCollected++;

        await emitProgress(
          `[${placeNum}/${itemsToProcess.length}] Coletado: ${placeRecord.name}`
        );
      } catch (placeErr: any) {
        totalErrors++;
        console.error(`Erro ao coletar ficha ${item.url}:`, placeErr.message);
        await emitProgress(
          `[${placeNum}/${itemsToProcess.length}] Erro na ficha: ${placeErr.message}`
        );
      }

      // Polite pause between requests to prevent rate limits
      await new Promise((r) => setTimeout(r, 600));
    }

    const finalStatus = handle.cancelled ? 'stopped' : 'completed';
    const statusMsg = handle.cancelled
      ? `Coleta interrompida. ${totalCollected} registros coletados com sucesso.`
      : `Coleta concluída! ${totalCollected} estabelecimentos coletados e salvos no SQLite.`;

    await emitProgress(statusMsg, {
      status: finalStatus,
      status_message: statusMsg,
      completed_at: new Date().toISOString(),
    });
  } catch (error: any) {
    totalErrors++;
    const errMsg = error.message || 'Erro inesperado durante a coleta.';
    console.error('Scraper fatal error:', error);
    await emitProgress(`Erro na coleta: ${errMsg}`, {
      status: 'failed',
      status_message: errMsg,
      completed_at: new Date().toISOString(),
    });
  } finally {
    activeJobs.delete(jobId);
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
  }
}
