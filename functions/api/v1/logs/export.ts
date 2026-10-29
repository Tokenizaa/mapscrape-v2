import { authenticateRequest, sendAuthError, type AuthOk } from '@/src/server/auth';
import { listAuditLogs } from '@/src/server/audit-log';
import { getQuery } from '@/functions/_util';

export const onRequestGet = async (request: Request): Promise<Response> => {
  const auth = await authenticateRequest(request.headers.get('authorization'));
  if (!auth.ok) {
    const e = auth as { status: number; error: string };
    return new Response(JSON.stringify({ error: e.error }), { status: e.status, headers: { 'Content-Type': 'application/json' } });
  }
  const scope = (auth as AuthOk).context.scope;

  const q = getQuery(request.url);

  try {
    const { logs } = await listAuditLogs({
      limit: q.limit ? Number(q.limit) : 500,
      offset: q.offset ? Number(q.offset) : 0,
      level: q.level || undefined,
      category: q.category || undefined,
      query: q.query || undefined,
      jobId: q.jobId || undefined,
      consumerProject: scope,
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
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
