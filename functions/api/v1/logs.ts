import { authenticateRequest, sendAuthError, type AuthOk } from '@/src/server/auth';
import { listAuditLogs } from '@/src/server/audit-log';
import { json, getQuery } from '@/functions/_util';

export const onRequestGet = async (request: Request): Promise<Response> => {
  const auth = await authenticateRequest(request.headers.get('authorization'));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const scope = (auth as AuthOk).context.scope;

  const q = getQuery(request.url);

  try {
    const { logs, total } = await listAuditLogs({
      limit: q.limit ? Number(q.limit) : 100,
      offset: q.offset ? Number(q.offset) : 0,
      level: q.level || undefined,
      category: q.category || undefined,
      query: q.query || undefined,
      jobId: q.jobId || undefined,
      consumerProject: scope,
    });

    return json({ logs, total });
  } catch {
    return json({ error: 'logs_query_failed', message: 'Erro ao consultar logs de auditoria.' }, 500);
  }
};
