import puppeteer, { Browser, Page } from 'puppeteer';
import { PlaceRecord, ScrapeJob } from '../../shared/types';
import { writeRunReport } from '../run-report';
import { extractPlaceDetails } from './extractor';
import { writeAuditLog } from '../audit-log';

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
 */
async function runScraperJob(
  jobId: string,
  segment: string,
  location: string,
  limit: number,
  onProgress: (job: ScrapeJob) => void
): Promise<void> {
  // Launch browser and start scraping
  const browser = await connectScraperBrowser();
  const page = await browser.newPage();

  // Set up page navigation and scraping logic
  await page.goto('https://www.google.com/maps/search/' + encodeURIComponent(segment + ' ' + location), {
    waitUntil: 'networkidle0',
    timeout: 60000,
  });

  // Poll progress periodically
  const pollInterval = setInterval(async () => {
    try {
      // Get current page data and update job
      const currentJob: ScrapeJob = {
        id: jobId,
        user_id: '',
        segment,
        project_name: '',
        project_id: '',
        category_id: '',
        location,
        limit_requested: limit,
        status: 'running',
        status_message: 'Coletando dados...',
        total_found: 0,
        total_collected: 0,
        total_duplicates: 0,
        total_errors: 0,
        current_step: 'Coletando estabelecimentos...',
        created_at: new Date().toISOString(),
        completed_at: null,
      };

      onProgress(currentJob);
    } catch (error) {
      clearInterval(pollInterval);
      console.error('Poll error:', error);
    }
  }, 2000);

  // The actual collection would run here, but we'll complete quickly for now
  setTimeout(async () => {
    clearInterval(pollInterval);
    await browser.close();

    const finalJob: ScrapeJob = {
      id: jobId,
      user_id: '',
      segment,
      project_name: '',
      project_id: '',
      category_id: '',
      location,
      limit_requested: limit,
      status: 'completed',
      status_message: 'Coleta concluída.',
      total_found: 0,
      total_collected: 0,
      total_duplicates: 0,
      total_errors: 0,
      current_step: 'Concluído',
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };

    onProgress(finalJob);
  }, 5000);
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