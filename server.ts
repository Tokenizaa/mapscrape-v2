import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  initDb,
  createJob,
  getJob,
  listJobs,
  deleteJob,
  getPlaces,
  getPlacesByIds,
  getAllPlaces,
} from './src/server/db';
import { runScraperJob, stopScrapeJob, isJobRunning } from './src/server/scraper/runner';
import { generateCsv } from './src/server/scraper/csv';
import { ScrapeJob, PlaceRecord } from './src/shared/types';
import { initAuditLog, listAuditLogs, writeAuditLog } from './src/server/audit-log';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  await initDb();
  await initAuditLog();
  await writeAuditLog({ category: 'server', event: 'server.start', message: 'Servidor iniciado e banco inicializado.' });
  console.log('SQLite database initialized.');

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isDev = process.env.NODE_ENV !== 'production';

  app.use(express.json());

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

      const newJob: ScrapeJob = {
        id: jobId,
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
      await writeAuditLog({ category: 'scraper', event: 'job.started', message: 'Coleta iniciada.', jobId, metadata: { segment: segment.trim(), location: location.trim(), limit: limitNum } });

      // Start asynchronous scraping
      runScraperJob(jobId, segment, location, limitNum, (updatedJob) => {
        broadcastJobUpdate(updatedJob);
      }).catch(async (err) => {
        console.error('Job error:', err);
        await writeAuditLog({ level: 'error', category: 'scraper', event: 'job.unhandled_error', message: err?.message || 'Erro não tratado na tarefa.', jobId, metadata: { stack: String(err?.stack || '').slice(0, 5000) } }).catch(() => {});
      });

      return res.json({
        success: true,
        jobId,
        message: 'Coleta iniciada com sucesso.',
      });
    } catch (err: any) {
      console.error('Start error:', err);
      return res.status(500).json({ error: err.message || 'Erro ao iniciar coleta.' });
    }
  });

  // 2. Stop scraping job
  app.post('/api/scrape/stop/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    const stopped = stopScrapeJob(id);
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
      await writeAuditLog({ level: 'error', category: 'api', event: 'logs.query_failed', message: err?.message || 'Falha ao consultar logs.' }).catch(() => {});
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

  // --- Vite / Frontend Integration ---
  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite middleware attached in development mode.');
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MapScrape server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
