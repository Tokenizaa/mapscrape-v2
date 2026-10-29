import { authenticateRequest, sendAuthError, type AuthOk } from '@/src/server/auth';
import { listAuditLogs } from '@/src/server/audit-log';

/**
 * GET /api/v1/logs — Lista eventos de auditoria do consumidor autenticado.
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
    const { logs, total } = await listAuditLogs({
      limit: req.query?.limit ? Number(req.query.limit) : 100,
      offset: req.query?.offset ? Number(req.query.offset) : 0,
      level: req.query?.level || undefined,
      category: req.query?.category || undefined,
      query: req.query?.query || undefined,
      jobId: req.query?.jobId || undefined,
      consumerProject: scope,
    });

    res.status(200).json({ logs, total });
  } catch (error) {
    res.status(500).json({ error: 'logs_query_failed', message: 'Erro ao consultar logs de auditoria.' });
  }
}
