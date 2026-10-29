import { authenticateRequest, sendAuthError, type AuthOk } from '@/functions/_auth';
import { listAuditLogs } from '@/src/server/audit-log';
import { getRequest, getQuery } from '@/functions/_util';

export const onRequestGet = async (context: any): Promise<Response> => {
  const req = getRequest(context);
  const auth = await authenticateRequest(context);
  if (auth.ok === false) {
    return new Response(JSON.stringify({ error: auth.error }), { status: auth.status, headers: { 'Content-Type': 'application/json' } });
  }
  const authContext = auth as AuthOk;
  const scope = authContext.context.scope;

  const q = getQuery(req.url);

  try {
    const { logs } = await listAuditLogs({
      limit: q.limit ? Number(q.limit) : 500, offset: q.offset ? Number(q.offset) : 0,
      level: q.level || undefined, category: q.category || undefined,
      query: q.query || undefined, jobId: q.jobId || undefined, consumerProject: scope,
    });

    const jsonl = logs.map((log) => JSON.stringify(log)).join('\n') + (logs.length ? '\n' : '');

    return new Response(jsonl, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Content-Disposition': 'attachment; filename="mapscrape-audit.jsonl"',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'logs_export_failed', message: 'Erro ao exportar logs de auditoria.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
