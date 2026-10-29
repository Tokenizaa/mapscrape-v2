import { authenticateRequest, sendAuthError, type AuthOk } from '@/functions/_auth';
import { listAuditLogs } from '@/src/server/audit-log';
import { json, getRequest, getQuery } from '@/functions/_util';

export const onRequestGet = async (context: any): Promise<Response> => {
  const req = getRequest(context);
  const auth = await authenticateRequest(context);
  const err = sendAuthError(json, auth);
  if (err) return err;
  const authContext = auth as AuthOk;
  const scope = authContext.context.scope;

  const q = getQuery(req.url);

  try {
    const { logs, total } = await listAuditLogs({
      limit: q.limit ? Number(q.limit) : 100, offset: q.offset ? Number(q.offset) : 0,
      level: q.level || undefined, category: q.category || undefined,
      query: q.query || undefined, jobId: q.jobId || undefined, consumerProject: scope,
    });
    return json({ logs, total });
  } catch {
    return json({ error: 'logs_query_failed', message: 'Erro ao consultar logs de auditoria.' }, 500);
  }
};
