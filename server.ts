import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  initDb,
  createJob,
  getJob,
  listJobs,
  deleteJob,
  getPlaces,
  getPlacesByIds,
  getAllPlaces,
  createApiCredential,
  findActiveApiCredential,
  revokeApiCredential,
  listApiCredentials,
} from './src/server/db';
import { runScraperJob, stopScrapeJob, isJobRunning } from './src/server/scraper/runner';
import { generateCsv } from './src/server/scraper/csv';
import { ScrapeJob, PlaceRecord } from './src/shared/types';
import { initAuditLog, listAuditLogs, writeAuditLog } from './src/server/audit-log';
import { readRunReport, readRunReportPdf } from './src/server/run-report';

import pino from 'pino';
import { timingSafeEqual, createHash, randomBytes } from 'node:crypto';
import { waitUntil } from '@vercel/functions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function hasStaticApiKey(value: string): boolean {
  const configured = (process.env.MAPSCRAPE_API_KEYS || '').split(',').map((entry) => entry.trim()).filter(Boolean);
  return configured.some((candidate) => safeEqual(candidate, value));
}

async function authenticatedConsumer(req: Request): Promise<{ id: string; consumer_project: string } | null> {
  const match = /^Bearer\s+(.+)$/i.exec(req.header('authorization') || '');
  if (!match) return null;
  const supplied = match[1];
  if (hasStaticApiKey(supplied)) return { id: 'static-key', consumer_project: 'operator-static-key' };
  const keyHash = createHash('sha256').update(supplied).digest('hex');
  return findActiveApiCredential(keyHash);
}

function hasProvisioningAccess(req: Request): boolean {
  const expected = process.env.MAPSCRAPE_PROVISIONING_TOKEN?.trim();
  const provided = req.header('x-mapscrape-provisioning-token') || '';
  return Boolean(expected && provided && safeEqual(expected, provided));
}

function apiLead(record: PlaceRecord): Record<string, unknown> {
  const parse = (value: unknown, fallback: unknown) => {
    if (typeof value !== 'string' || !value.trim()) return fallback;
    try { return JSON.parse(value); } catch { return value; }
  };
  return {
    ...record,
    photos: typeof record.photos === 'string' ? record.photos.split(' | ').filter(Boolean) : [],
    videos: typeof record.videos === 'string' ? record.videos.split(' | ').filter(Boolean) : [],
    reviews: parse(record.reviews, []),
    review_topics: parse(record.review_topics, []),
    additional_attributes: parse(record.additional_attributes, {}),
    media_items: parse(record.media_items, []),
    services_attributes: parse(record.services_attributes, {}),
    social_links: typeof record.social_links === 'string' ? record.social_links.split(' | ').filter(Boolean) : [],
  };
}

async function safeWriteAuditLog(input: Parameters<typeof writeAuditLog>[0]): Promise<void> {
  try { await writeAuditLog(input); } catch (error) { console.error('Audit log write failed:', error); }
}

export async function createApp() {
  await initDb();
  await initAuditLog();
  await safeWriteAuditLog({ category: 'server', event: 'server.start', message: 'Servidor iniciado e banco inicializado.' });
  console.log('SQLite database initialized.');

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isDev = process.env.NODE_ENV !== 'production';

  app.use(express.json());

  // Lightweight production health check: createApp() has already initialized the database.
  app.get('/api/health', async (_req: Request, res: Response) => {
    try {
      const { countPlaces } = await import('./src/server/db');
      const totalPlaces = await countPlaces();
      return res.json({ status: 'ok', database: 'connected', totalPlaces, timestamp: new Date().toISOString() });
    } catch (error) {
      console.error('Health check failed:', error);
      return res.status(503).json({ status: 'degraded', database: 'unavailable' });
    }
  });

  // Safe production diagnostic uses the same normalized WebSocket URL as the scraper.
  app.get('/api/health/browser', async (_req: Request, res: Response) => {
    let endpoint: string | undefined;
    try {
      const { getBrowserWSEndpoint, getBrowserEndpointDiagnostic } = await import('./src/server/browserless-endpoint');
      endpoint = getBrowserWSEndpoint();
      const diagnostic = getBrowserEndpointDiagnostic(endpoint);
      const puppeteer = (await import('puppeteer')).default;
      const browser = await puppeteer.connect({ browserWSEndpoint: endpoint, protocolTimeout: 30000 });
      await browser.close();
      return res.json({ status: 'ok', connection: 'connected-and-closed', ...diagnostic });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha desconhecida';
      // Never return the configured URL or query string: it contains the token.
      let diagnostic: Record<string, string | boolean | number> = {};
      try {
        const { getBrowserEndpointDiagnostic } = await import('./src/server/browserless-endpoint');
        if (endpoint) diagnostic = getBrowserEndpointDiagnostic(endpoint);
      } catch {
        const configured = process.env.BROWSER_WS_ENDPOINT?.trim();
        if (!configured) {
          return res.status(503).json({ status: 'error', reason: 'BROWSER_WS_ENDPOINT ausente ou vazia.' });
        }
        try {
          const raw = new URL(configured);
          diagnostic = {
            protocol: raw.protocol,
            hostname: raw.hostname,
            hasCredentials: Boolean(raw.username || raw.password),
            hasQuery: Boolean(raw.search),
            pathDepth: raw.pathname.split('/').filter(Boolean).length,
            endpointLength: configured.length,
          };
        } catch {
          diagnostic = { reason: 'URL configurada inválida', endpointLength: configured.length };
        }
      }
      return res.status(503).json({ status: 'error', reason: message.slice(0, 240), ...diagnostic });
    }
  });

  // In-memory SSE connections for live job updates
  const sseClients = new Map<string, Response[]>();

  const broadcastJobUpdate = (job: ScrapeJob) => {
    const clients = sseClients.get(job.id);
    if (clients) {
      const data = `data: ${JSON.stringify(job)}\n\n`;
      clients.forEach((res) => {
        try {
          res.write(data);
        } catch {
          // Client disconnected
        }
      });
    }
  };

  // --- API Endpoints ---

  // 1. Start scraping job
  app.post('/api/scrape/start', async (req: Request, res: Response) => {
    try {
      const { segment, location, limit } = req.body;

      if (!segment || typeof segment !== 'string' || !segment.trim()) {
        return res.status(400).json({ error: 'O campo segmento é obrigatório.' });
      }
      if (!location || typeof location !== 'string' || !location.trim()) {
        return res.status(400).json({ error: 'O campo localização é obrigatório.' });
      }

      const limitNum = Math.max(1, Math.min(100, Number(limit) || 20));
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const newJob: ScrapeJob & { user_id: string } = {
        id: jobId,
        user_id: (req as any).user?.id || "dev-user-1",
        segment: segment.trim(),
        location: location.trim(),
        limit_requested: limitNum,
        status: 'running',
        status_message: 'Iniciando automação...',
        total_found: 0,
        total_collected: 0,
        total_duplicates: 0,
        total_errors: 0,
        current_step: 'Preparando navegador...',
        created_at: new Date().toISOString(),
      };

      await createJob(newJob);
      await safeWriteAuditLog({ category: 'scraper', event: 'job.started', message: 'Coleta iniciada.', jobId, metadata: { segment: segment.trim(), location: location.trim(), limit: limitNum } });

      // Keep the scrape alive after the HTTP response on Vercel.
      const scrapePromise = runScraperJob(jobId, segment, location, limitNum, (updatedJob) => {
        broadcastJobUpdate(updatedJob);
      }).catch(async (err) => {
        console.error('Job error:', err);
        await safeWriteAuditLog({ level: 'error', category: 'scraper', event: 'job.unhandled_error', message: err?.message || 'Erro não tratado na tarefa.', jobId, metadata: { stack: String(err?.stack || '').slice(0, 5000) } }).catch(() => {});
      });
      if (process.env.VERCEL) waitUntil(scrapePromise);

      return res.json({
        success: true,
        jobId,
        message: 'Coleta iniciada com sucesso.',
      });
    } catch (err: any) {
      console.error('Start error:', err);
      await safeWriteAuditLog({ level: 'error', category: 'api', event: 'job.start_failed', message: err?.message || 'Falha ao iniciar coleta.', metadata: { stack: String(err?.stack || '').slice(0, 4000) } }).catch(() => {});
      return res.status(500).json({ error: err.message || 'Erro ao iniciar coleta.' });
    }
  });

  // 2. Stop scraping job
  app.post('/api/scrape/stop/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    const stopped = stopScrapeJob(id);
    await safeWriteAuditLog({ level: stopped ? 'warn' : 'info', category: 'scraper', event: stopped ? 'job.stop_requested' : 'job.stop_not_active', message: stopped ? 'Interrupção solicitada pelo usuário.' : 'Solicitação de interrupção para tarefa não ativa.', jobId: id });
    return res.json({
      success: true,
      stopped,
      message: stopped ? 'Solicitação de interrupção enviada.' : 'A tarefa não está em execução ativa.',
    });
  });

  // 3. Get job status
  app.get('/api/scrape/status/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    const job = await getJob(id);
    if (!job) {
      return res.status(404).json({ error: 'Pesquisa não encontrada.' });
    }
    return res.json({
      ...job,
      isRunning: isJobRunning(id),
    });
  });

  // 4. SSE Stream for real-time progress
  app.get('/api/scrape/stream/:id', async (req: Request, res: Response) => {
    const { id } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const job = await getJob(id);
    if (job) {
      res.write(`data: ${JSON.stringify(job)}\n\n`);
    }

    if (!sseClients.has(id)) {
      sseClients.set(id, []);
    }
    sseClients.get(id)!.push(res);

    req.on('close', () => {
      const clients = sseClients.get(id) || [];
      const idx = clients.indexOf(res);
      if (idx !== -1) clients.splice(idx, 1);
      if (clients.length === 0) sseClients.delete(id);
    });
  });

  // 5. Query places (with search, sort, pagination)
  app.get('/api/places', async (req: Request, res: Response) => {
    try {
      const { jobId, query, sortBy, sortOrder, offset, limit } = req.query;

      const result = await getPlaces({
        jobId: jobId ? String(jobId) : undefined,
        query: query ? String(query) : undefined,
        sortBy: sortBy ? String(sortBy) : undefined,
        sortOrder: sortOrder === 'asc' ? 'asc' : 'desc',
        offset: offset ? Number(offset) : 0,
        limit: limit ? Number(limit) : 50,
      });

      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Erro ao consultar locais.' });
    }
  });

  // 6. Get all places for a job (or overall)
  app.get('/api/places/all', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.query;
      const records = await getAllPlaces(jobId ? String(jobId) : undefined);
      return res.json(records);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Erro ao consultar todos os locais.' });
    }
  });

  // 7. List past searches history
  app.get('/api/history', async (_req: Request, res: Response) => {
    try {
      const history = await listJobs();
      return res.json(history);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Erro ao consultar histórico.' });
    }
  });

  // 8. Delete past search
  app.delete('/api/history/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await deleteJob(id);
      return res.json({ success: true, message: 'Pesquisa removida com sucesso.' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Erro ao remover histórico.' });
    }
  });

  // 9. Export CSV
  app.post('/api/export/csv', async (req: Request, res: Response) => {
    try {
      const { jobId, placeIds, fields, filename } = req.body;

      let records: PlaceRecord[] = [];
      if (placeIds && Array.isArray(placeIds) && placeIds.length > 0) {
        records = await getPlacesByIds(placeIds);
      } else if (jobId) {
        records = await getAllPlaces(jobId);
      } else {
        records = await getAllPlaces();
      }

      const csvContent = generateCsv(records, fields);

      const safeFilename = filename
        ? String(filename).replace(/[^a-zA-Z0-9_-]/g, '_')
        : `mapscrape_export_${Date.now()}`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.csv"`);
      return res.send(csvContent);
    } catch (err: any) {
      console.error('Export error:', err);
      return res.status(500).json({ error: err.message || 'Erro ao exportar CSV.' });
    }
  });

  // Download the JSON evidence report generated for a collection run.
  app.get('/api/reports/:jobId', async (req: Request, res: Response) => {
    try {
      const report = await readRunReport(String(req.params.jobId || ''));
      if (!report) return res.status(404).json({ error: 'Relatório ainda não existe para esta pesquisa.' });
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="mapscrape-report-${String(req.params.jobId).replace(/[^a-zA-Z0-9_-]/g, '_')}.json"`);
      return res.json(report);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Erro ao carregar relatório.' });
    }
  });

  app.get('/api/reports/:jobId/pdf', async (req: Request, res: Response) => {
    try {
      const jobId = String(req.params.jobId || '');
      const pdf = await readRunReportPdf(jobId);
      if (!pdf) return res.status(404).json({ error: 'PDF ainda não existe para esta pesquisa. Confira se a execução já terminou e se a geração do PDF foi bem-sucedida.' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="mapscrape-report-${jobId}.pdf"`);
      return res.send(pdf);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Erro ao carregar PDF.' });
    }
  });

  // Field coverage is calculated from persisted records, not the current UI page.
  app.get('/api/field-coverage', async (req: Request, res: Response) => {
    try {
      const jobId = req.query.jobId ? String(req.query.jobId) : undefined;
      const records = await getAllPlaces(jobId);
      const fields: { key: keyof PlaceRecord; label: string }[] = [
        { key: 'name', label: 'Nome' },
        { key: 'category', label: 'Categoria' },
        { key: 'address', label: 'Endereço' },
        { key: 'phone', label: 'Telefone' },
        { key: 'website', label: 'Site' },
        { key: 'rating', label: 'Nota' },
        { key: 'review_count', label: 'Quantidade de avaliações' },
        { key: 'price_range', label: 'Faixa de preço' },
        { key: 'opening_hours', label: 'Horários' },
        { key: 'business_status', label: 'Status operacional' },
        { key: 'latitude', label: 'Latitude' },
        { key: 'longitude', label: 'Longitude' },
        { key: 'maps_url', label: 'Link do Maps' },
        { key: 'description', label: 'Descrição' },
        { key: 'services_attributes', label: 'Serviços e atributos' },
        { key: 'photos', label: 'Fotos (URLs)' },
        { key: 'videos', label: 'Vídeos (URLs)' },
        { key: 'logo_url', label: 'Logo / Foto de perfil' },
        { key: 'collected_at', label: 'Data da coleta' },
      ];
      const coverage = fields.map((field) => {
        const populated = records.reduce((count, record) => count + (String(record[field.key] ?? '').trim() ? 1 : 0), 0);
        return {
          ...field,
          populated,
          missing: records.length - populated,
          percentage: records.length ? Math.round((populated / records.length) * 100) : 0,
        };
      });
      const populatedCells = coverage.reduce((sum, field) => sum + field.populated, 0);
      const totalCells = records.length * fields.length;
      return res.json({
        totalRecords: records.length,
        totalFields: fields.length,
        averageCoverage: totalCells ? Math.round((populatedCells / totalCells) * 100) : 0,
        fields: coverage,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Erro ao calcular cobertura dos campos.' });
    }
  });

  // 10. Structured audit log query
  app.get('/api/logs', async (req: Request, res: Response) => {
    try {
      const result = await listAuditLogs({
        limit: req.query.limit ? Number(req.query.limit) : 100,
        offset: req.query.offset ? Number(req.query.offset) : 0,
        level: req.query.level ? String(req.query.level) : undefined,
        category: req.query.category ? String(req.query.category) : undefined,
        jobId: req.query.jobId ? String(req.query.jobId) : undefined,
        query: req.query.query ? String(req.query.query) : undefined,
      });
      return res.json(result);
    } catch (err: any) {
      await safeWriteAuditLog({ level: 'error', category: 'api', event: 'logs.query_failed', message: err?.message || 'Falha ao consultar logs.' }).catch(() => {});
      return res.status(500).json({ error: err.message || 'Erro ao consultar logs.' });
    }
  });

  // Download newline-delimited JSON, easy to attach to GitHub issues or commit as evidence.
  app.get('/api/logs/export', async (req: Request, res: Response) => {
    try {
      const result = await listAuditLogs({
        limit: 500,
        offset: 0,
        level: req.query.level ? String(req.query.level) : undefined,
        category: req.query.category ? String(req.query.category) : undefined,
        jobId: req.query.jobId ? String(req.query.jobId) : undefined,
        query: req.query.query ? String(req.query.query) : undefined,
      });
      const body = result.logs.map((log) => JSON.stringify({
        ...log,
        metadata: (() => { try { return JSON.parse(log.metadata || '{}'); } catch { return log.metadata; } })(),
      })).join('\n') + (result.logs.length ? '\n' : '');
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="mapscrape-audit-${new Date().toISOString().slice(0, 10)}.jsonl"`);
      return res.send(body);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Erro ao exportar logs.' });
    }
  });

  // --- Stable machine-to-machine API v1 ---
  // Configure MAPSCRAPE_API_KEYS as a comma-separated list of independently generated secrets (32+ chars each).
  // Keep this setting server-side only. Legacy UI routes remain compatible.
  app.get('/api/v1/health', async (_req: Request, res: Response) => {
    try {
      const { countPlaces } = await import('./src/server/db');
      return res.json({ status: 'ok', service: 'mapscrape-api', apiVersion: 'v1', database: 'connected', totalLeads: await countPlaces(), timestamp: new Date().toISOString() });
    } catch {
      return res.status(503).json({ status: 'degraded', service: 'mapscrape-api', apiVersion: 'v1', database: 'unavailable' });
    }
  });

  // Credential lifecycle is isolated behind a separate bootstrap token.
  app.post('/api/v1/provisioning/credentials', async (req: Request, res: Response) => {
    if (!hasProvisioningAccess(req)) return res.status(401).json({ error: 'provisioning_unauthorized' });
    const consumerName = typeof req.body?.consumerName === 'string' ? req.body.consumerName.trim() : '';
    const consumerProject = typeof req.body?.consumerProject === 'string' ? req.body.consumerProject.trim() : '';
    if (!consumerName || !consumerProject || consumerName.length > 120 || consumerProject.length > 200) {
      return res.status(422).json({ error: 'invalid_consumer', message: 'consumerName e consumerProject são obrigatórios e possuem limites de tamanho.' });
    }
    try {
      const existing = (await listApiCredentials()).find((entry) => entry.consumer_project === consumerProject && entry.status === 'active');
      if (existing) return res.status(409).json({ error: 'credential_already_exists', message: 'Este projeto já possui uma credencial ativa. Revogue-a antes de emitir outra.', credentialId: existing.id });
      const secret = randomBytes(32).toString('hex');
      const id = `msc_${randomBytes(12).toString('hex')}`;
      await createApiCredential({ id, consumerName, consumerProject, keyHash: createHash('sha256').update(secret).digest('hex'), createdAt: new Date().toISOString() });
      await safeWriteAuditLog({ category: 'api', event: 'api_credential.issued', message: 'Credencial de API emitida.', metadata: { credentialId: id, consumerProject } });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(201).json({ data: { credentialId: id, apiKey: secret, consumerName, consumerProject, revealOnce: true } });
    } catch (error) {
      return res.status(500).json({ error: 'credential_issue_failed', message: error instanceof Error ? error.message : 'Falha ao emitir credencial.' });
    }
  });

  // Rotate a consumer credential without exposing the previous secret.
  // The bootstrap token is required; the new key is revealed only in this response.
  app.post('/api/v1/provisioning/credentials/:id/rotate', async (req: Request, res: Response) => {
    if (!hasProvisioningAccess(req)) return res.status(401).json({ error: 'provisioning_unauthorized' });
    const id = String(req.params.id);
    try {
      const current = (await listApiCredentials()).find((entry) => entry.id === id && entry.status === 'active');
      if (!current) return res.status(404).json({ error: 'active_credential_not_found' });
      // Retire the old key before issuing a replacement so only one key per project remains active.
      const revoked = await revokeApiCredential(id);
      if (!revoked) return res.status(409).json({ error: 'credential_rotation_conflict' });
      const secret = randomBytes(32).toString('hex');
      const newId = `msc_${randomBytes(12).toString('hex')}`;
      try {
        await createApiCredential({
          id: newId,
          consumerName: current.consumer_name,
          consumerProject: current.consumer_project,
          keyHash: createHash('sha256').update(secret).digest('hex'),
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        await safeWriteAuditLog({ level: 'error', category: 'api', event: 'api_credential.rotation_failed', message: 'Falha ao criar a credencial substituta após revogação.', metadata: { previousCredentialId: id, consumerProject: current.consumer_project } });
        return res.status(500).json({ error: 'credential_rotation_failed', message: 'A chave anterior foi revogada, mas a nova emissão falhou. Execute novamente a emissão para este projeto.' });
      }
      await safeWriteAuditLog({ category: 'api', event: 'api_credential.rotated', message: 'Credencial de API rotacionada.', metadata: { previousCredentialId: id, credentialId: newId, consumerProject: current.consumer_project } });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(201).json({ data: { credentialId: newId, previousCredentialId: id, apiKey: secret, consumerName: current.consumer_name, consumerProject: current.consumer_project, revealOnce: true } });
    } catch {
      return res.status(500).json({ error: 'credential_rotation_failed' });
    }
  });

  app.get('/api/v1/provisioning/credentials', async (req: Request, res: Response) => {
    if (!hasProvisioningAccess(req)) return res.status(401).json({ error: 'provisioning_unauthorized' });
    try { res.setHeader('Cache-Control', 'no-store'); return res.json({ data: await listApiCredentials() }); }
    catch { return res.status(500).json({ error: 'credential_list_failed' }); }
  });

  app.delete('/api/v1/provisioning/credentials/:id', async (req: Request, res: Response) => {
    if (!hasProvisioningAccess(req)) return res.status(401).json({ error: 'provisioning_unauthorized' });
    try {
      const id = String(req.params.id);
      const revoked = await revokeApiCredential(id);
      if (!revoked) return res.status(404).json({ error: 'active_credential_not_found' });
      await safeWriteAuditLog({ category: 'api', event: 'api_credential.revoked', message: 'Credencial de API revogada.', metadata: { credentialId: id } });
      return res.status(200).json({ data: { credentialId: id, status: 'revoked' } });
    } catch { return res.status(500).json({ error: 'credential_revoke_failed' }); }
  });

  app.use('/api/v1', async (req: Request, res: Response, next) => {
    if (req.path === '/health' && req.method === 'GET') return next();
    // Individual hashed credentials are persisted in the database; they remain valid
    // even when no legacy static key or provisioning bootstrap token is configured.
    try {
      const consumer = await authenticatedConsumer(req);
      if (!consumer) return res.status(401).json({ error: 'unauthorized', message: 'Informe uma chave de API válida no cabeçalho Authorization: Bearer.' });
      (req as Request & { mapscrapeConsumer?: typeof consumer }).mapscrapeConsumer = consumer;
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-MapScrape-Consumer', consumer.consumer_project);
      return next();
    } catch (error) {
      console.error('API credential lookup failed:', error instanceof Error ? error.message : 'unknown');
      return res.status(503).json({ error: 'authentication_unavailable' });
    }
  });

  app.get('/api/v1/leads', async (req: Request, res: Response) => {
    try {
      const limit = Number(req.query.limit ?? 50);
      const offset = Number(req.query.offset ?? 0);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) {
        return res.status(422).json({ error: 'invalid_pagination', message: 'limit deve ser inteiro entre 1 e 100 e offset deve ser inteiro >= 0.' });
      }
      const result = await getPlaces({
        jobId: req.query.jobId ? String(req.query.jobId) : undefined,
        query: req.query.query ? String(req.query.query) : undefined,
        sortBy: req.query.sortBy ? String(req.query.sortBy) : undefined,
        sortOrder: req.query.sortOrder === 'asc' ? 'asc' : 'desc',
        offset, limit,
        consumerProject: (req as any).mapscrapeConsumer.consumer_project,
      });
      return res.json({ data: result.places.map(apiLead), pagination: { total: result.total, limit, offset, hasMore: offset + result.places.length < result.total } });
    } catch (error) {
      return res.status(500).json({ error: 'lead_query_failed', message: error instanceof Error ? error.message : 'Falha ao consultar leads.' });
    }
  });

  app.get('/api/v1/leads/:id', async (req: Request, res: Response) => {
    try {
      const records = await getPlacesByIds([String(req.params.id)], (req as any).mapscrapeConsumer.consumer_project);
      if (!records.length) return res.status(404).json({ error: 'lead_not_found', message: 'Lead não encontrado.' });
      return res.json({ data: apiLead(records[0]) });
    } catch (error) {
      return res.status(500).json({ error: 'lead_query_failed', message: error instanceof Error ? error.message : 'Falha ao consultar lead.' });
    }
  });

  app.post('/api/v1/jobs', async (req: Request, res: Response) => {
    try {
      const segment = typeof req.body?.segment === 'string' ? req.body.segment.trim() : '';
      const location = typeof req.body?.location === 'string' ? req.body.location.trim() : '';
      if (!segment || !location) return res.status(422).json({ error: 'invalid_request', message: 'segment e location são obrigatórios.' });
      const limit = Number(req.body?.limit ?? 20);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) return res.status(422).json({ error: 'invalid_limit', message: 'limit deve ser inteiro entre 1 e 100.' });
      const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const job: ScrapeJob = {
        id: jobId, user_id: (req as any).mapscrapeConsumer.consumer_project, segment, location, limit_requested: limit,
        status: 'running', status_message: 'Coleta solicitada via API v1.', total_found: 0,
        total_collected: 0, total_duplicates: 0, total_errors: 0,
        current_step: 'Preparando coleta', created_at: new Date().toISOString(),
      };
      await createJob(job);
      await safeWriteAuditLog({ category: 'api', event: 'api_v1.job_started', message: 'Coleta iniciada via API v1.', jobId, metadata: { segment, location, limit } });
      const scrapePromise = runScraperJob(jobId, segment, location, limit, () => {}).catch(async (error) => {
        await safeWriteAuditLog({ level: 'error', category: 'api', event: 'api_v1.job_failed', message: error instanceof Error ? error.message : 'Falha na coleta.', jobId });
      });
      if (process.env.VERCEL) waitUntil(scrapePromise);
      return res.status(202).json({ data: { jobId, status: 'running', statusUrl: `/api/v1/jobs/${jobId}`, resultsUrl: `/api/v1/jobs/${jobId}/results` } });
    } catch (error) {
      return res.status(500).json({ error: 'job_start_failed', message: error instanceof Error ? error.message : 'Falha ao iniciar coleta.' });
    }
  });

  app.get('/api/v1/jobs/:id', async (req: Request, res: Response) => {
    try {
      const job = await getJob(String(req.params.id), (req as any).mapscrapeConsumer.consumer_project);
      if (!job) return res.status(404).json({ error: 'job_not_found', message: 'Coleta não encontrada.' });
      return res.json({ data: { ...job, isRunning: isJobRunning(job.id) } });
    } catch (error) {
      return res.status(500).json({ error: 'job_query_failed', message: error instanceof Error ? error.message : 'Falha ao consultar coleta.' });
    }
  });

  app.get('/api/v1/jobs/:id/results', async (req: Request, res: Response) => {
    try {
      const job = await getJob(String(req.params.id), (req as any).mapscrapeConsumer.consumer_project);
      if (!job) return res.status(404).json({ error: 'job_not_found', message: 'Coleta não encontrada.' });
      const limit = Number(req.query.limit ?? 50);
      const offset = Number(req.query.offset ?? 0);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) return res.status(422).json({ error: 'invalid_pagination', message: 'Parâmetros de paginação inválidos.' });
      const result = await getPlaces({ jobId: job.id, limit, offset, sortBy: 'collected_at', sortOrder: 'desc', consumerProject: (req as any).mapscrapeConsumer.consumer_project });
      return res.json({ data: result.places.map(apiLead), pagination: { total: result.total, limit, offset, hasMore: offset + result.places.length < result.total } });
    } catch (error) {
      return res.status(500).json({ error: 'job_results_failed', message: error instanceof Error ? error.message : 'Falha ao consultar resultados.' });
    }
  });

  // --- Vite / Frontend Integration ---
  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite middleware attached in development mode.');
  } else if (!process.env.VERCEL) {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  return app;
}

if (!process.env.VERCEL) {
  createApp().then((app) => {
    const PORT = Number(process.env.PORT) || 3000;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`MapScrape server running on http://0.0.0.0:${PORT}`);
    });
  }).catch((err) => {
    console.error('Fatal server startup error:', err);
    process.exit(1);
  });
}
