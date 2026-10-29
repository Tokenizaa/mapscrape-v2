import { authenticateRequest, sendAuthError, type AuthOk } from '@/src/server/auth';
import { listAuditLogs } from '@/src/server/audit-log';

/**
 * GET /api/v1/logs/export — Exporta eventos de auditoria em JSONL.
 * Query: limit, offset, level, category, query, jobId.
 * Autenticação: Bearer <MAPSCRAPE_API_KEY> ou Bearer <session Supabase>.
 */
export default async function handler(req: any, res: any): Promise<void> {
  const auth = await authenticateRequest(req.headers?.authorization);
  if (sendAuthError(res, auth)) return;
  const scope = (auth as AuthOk).context.scope;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Método não permitido.', message: 'Use GET.' });
    return;
  }

  try {
    const { logs } = await listAuditLogs({
      limit: req.query?.limit ? Number(req.query.limit) : 500,
      offset: req.query?.offset ? Number(req.query.offset) : 0,
      level: req.query?.level || undefined,
      category: req.query?.category || undefined,
      query: req.query?.query || undefined,
      jobId: req.query?.jobId || undefined,
      consumerProject: scope,
    });

    const jsonl = logs.map((log) => JSON.stringify(log)).join('\n') + (logs.length ? '\n' : '');

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Content-Disposition', 'attachment; filename="mapscrape-audit.jsonl"');
    res.status(200).send(jsonl);
  } catch (error) {
    res.status(500).json({ error: 'logs_export_failed', message: 'Erro ao exportar logs de auditoria.' });
  }
}
