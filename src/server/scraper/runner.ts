import puppeteer, { Browser, Page } from 'puppeteer';
import { PlaceRecord, ScrapeJob } from '../../shared/types';
import { writeRunReport } from '../run-report';
import { extractPlaceDetails } from './extractor';
import { writeAuditLog } from '../audit-log';
import { SELECTORS } from './selectors';
import {
  insertPlace as dbInsertPlace,
  updateJobProgress,
  getJob,
  placeExistsByUrl,
} from '../db';

interface ActiveJobHandle {
  cancelled: boolean;
  cancel: () => void;
}

const activeJobs = new Map<string, ActiveJobHandle>();

async function safeAudit(input: Parameters<typeof writeAuditLog>[0]): Promise<void> {
  try { await writeAuditLog(input); } catch { /* Diagnostics must never break collection. */ }
}

/**
 * Launch a browser instance for scraping.
 */
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
  return /connection closed|target closed|detached frame|session closed|websocket is not open|protocol error|browser has disconnected|cannot find context|net::/i.test(message);
}

function isBrowserConnected(browser: Browser): boolean {
  const compatible = browser as Browser & { connected?: boolean; isConnected?: () => boolean };
  if (typeof compatible.isConnected === 'function') return compatible.isConnected();
  return compatible.connected !== false;
}

function missingFields(place: PlaceRecord): string[] {
  const fields: (keyof PlaceRecord)[] = ['name', 'category', 'address', 'phone', 'website', 'rating', 'review_count', 'price_range', 'opening_hours', 'business_status', 'latitude', 'longitude', 'maps_url', 'description', 'services_attributes', 'photos', 'videos', 'logo_url', 'booking_url', 'social_links', 'reviews', 'review_topics', 'additional_attributes', 'media_items', 'plus_code', 'attributes', 'accessibility_attributes', 'next_opening_text', 'next_open_day', 'next_open_time', 'visible_photos_count', 'postal_code', 'country', 'city', 'state', 'source_place_id', 'source_url', 'popular_times', 'rating_distribution', 'review_highlights', 'field_status', 'collected_at'];
  return fields.filter((field) => {
    const value = place[field];
    if (value === undefined || value === null) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    if (typeof value === 'object' && Object.keys(value).length === 0) return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  });
}

/**
 * Insert a new place record into the database.
 * This function will be overridden/patched by server.ts which provides the Supabase client.
 */
async function insertPlace(place: PlaceRecord): Promise<void> {
  // Stub - will be replaced by the actual Supabase implementation from server.ts
  console.log('Insert place called (stub - use server.ts implementation)');
}

/**
 * Update an existing place record.
 */
async function updatePlace(id: string, place: PlaceRecord): Promise<void> {
  // Stub - will be replaced by the actual Supabase implementation from server.ts
  console.log('Update place called (stub - use server.ts implementation)');
}

/**
 * Get the last collected place for a search segment/location.
 * This function will be overridden by server.ts which provides the Supabase implementation.
 */
async function getLastCollectedPlaceForSearch(segment: string, location: string, consumerProject?: string): Promise<any> {
  // Stub - will be replaced by the actual Supabase implementation from server.ts
  console.log('Get last place called (stub - use server.ts implementation)');
  return null;
}

/**
 * Poll job progress via API endpoint.
 */
async function pollJobProgress(jobId: string): Promise<any> {
  // Use the API endpoint to check job status
  // This avoids direct DB access from the scraper
  return { status: 'unknown', current_step: 'Verificando progresso...' };
}

/**
 * Run a scrape job. This is the main orchestration function.
 * Opens Google Maps, walks the result list, opens each place sheet,
 * extracts details via extractPlaceDetails, and persists via Supabase.
 */
async function runScraperJob(
  jobId: string,
  segment: string,
  location: string,
  limit: number,
  onProgress: (job: Partial<ScrapeJob>) => void
): Promise<void> {
  const browser = await connectScraperBrowser();
  const page = await browser.newPage();

  // Register the job as active so stopScrapeJob() can cancel it.
  const handle: ActiveJobHandle = {
    cancelled: false,
    cancel: () => {
      handle.cancelled = true;
    },
  };
  activeJobs.set(jobId, handle);

  let totalFound = 0;
  let totalCollected = 0;
  let totalDuplicates = 0;
  let totalErrors = 0;

  const reportProgress = (updates: Partial<ScrapeJob>) => {
    onProgress({
      status: 'running',
      status_message: 'Coletando dados...',
      total_found: totalFound,
      total_collected: totalCollected,
      total_duplicates: totalDuplicates,
      total_errors: totalErrors,
      current_step: 'Coletando estabelecimentos...',
      ...updates,
    });
  };

  try {
    // Resolve job scope (user_id) for consumer-scoped duplicate checks.
    let scope: string | undefined;
    try {
      const job = await getJob(jobId);
      scope = job?.user_id;
    } catch {
      // Non-fatal: proceed without scope-based dedupe.
    }

    // 1. Navigate to the Google Maps search results page.
    await page.goto(
      'https://www.google.com/maps/search/' +
        encodeURIComponent(segment + ' ' + location),
      { waitUntil: 'networkidle0', timeout: 60000 }
    );

    // Wait for the results list to appear.
    await page
      .waitForSelector(SELECTORS.feed.container[0], { timeout: 30000 })
      .catch(() => {
        // The list may not match the exact selector; proceed to extract links anyway.
      });

    // 2. Walk the results list, scrolling to load more until we reach the limit.
    const placeUrls = new Set<string>();
    let previousCount = 0;
    let stagnantRounds = 0;

    while (placeUrls.size < limit && stagnantRounds < 6) {
      if (handle.cancelled) break;

      const links: string[] = await page.$$eval(
        SELECTORS.feed.placeLinks.join(', '),
        (anchors) =>
          anchors
            .map((a) => (a as HTMLAnchorElement)?.href)
            .filter(
              (href): href is string =>
                Boolean(href) && href.includes('/maps/place/')
            )
      );

      for (const url of links) {
        if (placeUrls.size >= limit) break;
        placeUrls.add(url);
      }

      totalFound = placeUrls.size;
      reportProgress({
        total_found: totalFound,
        current_step: `Encontrados ${totalFound} estabelecimento(s)...`,
      });

      if (placeUrls.size >= limit) break;

      // Scroll the results container to load more listings.
      const container = await page.$(SELECTORS.feed.container[0]);
      if (container) {
        await container.evaluate((el: HTMLElement) => {
          el.scrollTop = el.scrollHeight;
        });
      } else {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));

      if (placeUrls.size === previousCount) {
        stagnantRounds += 1;
      } else {
        stagnantRounds = 0;
        previousCount = placeUrls.size;
      }
    }

    // 3. Open each individual place sheet and extract details.
    for (const placeUrl of placeUrls) {
      if (handle.cancelled) break;
      if (totalCollected + totalDuplicates >= limit) break;

      // Skip duplicates already persisted (same Maps URL).
      const alreadyExists = await placeExistsByUrl(placeUrl, scope);
      if (alreadyExists) {
        totalDuplicates += 1;
        reportProgress({
          total_duplicates: totalDuplicates,
          current_step: `Ignorando duplicado (${totalDuplicates})...`,
        });
        continue;
      }

      let detailPage: Page | null = null;
      try {
        detailPage = await browser.newPage();
        await detailPage.goto(placeUrl, {
          waitUntil: 'networkidle0',
          timeout: 30000,
        });
        await new Promise((resolve) => setTimeout(resolve, 1500));

        const place = await extractPlaceDetails(detailPage, jobId, placeUrl);
        await dbInsertPlace(place);

        totalCollected += 1;
        reportProgress({
          total_collected: totalCollected,
          current_step: `Coletado ${totalCollected} de ${limit}...`,
        });
      } catch (error) {
        totalErrors += 1;
        console.error(`Erro ao coletar ${placeUrl}:`, error);
        reportProgress({
          total_errors: totalErrors,
          current_step: `Erro em ficha (${totalErrors})...`,
        });
      } finally {
        if (detailPage) {
          await detailPage.close().catch(() => {});
        }
      }
    }

    // 4. Finalize the job with a real terminal state.
    const finalStatus = handle.cancelled
      ? ('stopped' as const)
      : totalCollected === 0 && totalErrors > 0
        ? ('failed' as const)
        : ('completed' as const);

    reportProgress({
      status: finalStatus,
      status_message: handle.cancelled
        ? 'Interrompida pelo usuário.'
        : `Coleta finalizada: ${totalCollected} coletado(s), ${totalDuplicates} duplicado(s), ${totalErrors} erro(s).`,
      total_found: totalFound,
      total_collected: totalCollected,
      total_duplicates: totalDuplicates,
      total_errors: totalErrors,
      current_step: 'Concluído',
    });
  } catch (error) {
    totalErrors += 1;
    reportProgress({
      status: 'failed' as const,
      status_message: 'Falha durante a execução da coleta.',
      total_errors: totalErrors,
      current_step: 'Falha',
    });
    console.error(`runScraperJob ${jobId} failed:`, error);
  } finally {
    await browser.close().catch(() => {});
    activeJobs.delete(jobId);
  }
}

/**
 * Stop a running scrape job.
 */
function stopScrapeJob(jobId: string): boolean {
  const handle = activeJobs.get(jobId);
  if (handle) {
    handle.cancel();
    activeJobs.delete(jobId);
    return true;
  }
  return false;
}

/**
 * Check if a job is currently running.
 */
function isJobRunning(jobId: string): boolean {
  const handle = activeJobs.get(jobId);
  return handle !== undefined;
}

// Export all the functions for use by server.ts
export type { ActiveJobHandle };
export { runScraperJob, stopScrapeJob, isJobRunning, insertPlace, updatePlace, pollJobProgress, connectScraperBrowser, isTransientBrowserError, isBrowserConnected, missingFields, safeAudit };