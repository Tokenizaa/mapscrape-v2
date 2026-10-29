import { authenticateRequest, sendAuthError, type AuthOk } from '@/functions/_auth';
import { readRunReport } from '@/src/server/run-report';
import { json, getRequest, getParams } from '@/functions/_util';

export const onRequestGet = async (context: any): Promise<Response> => {
  const req = getRequest(context);
  const auth = await authenticateRequest(context);
  const err = sendAuthError(json, auth);
  if (err) return err;

  const params = getParams(context);
  const id = params.id;
  if (!id || !/^[a-zA-Z0-9_-]{1,160}$/.test(String(id))) {
    return json({ error: 'report_not_found', message: 'Relatório não encontrado.' }, 404);
  }

  try {
    const report = await readRunReport(String(id));
    if (!report) {
      return json({ error: 'report_not_found', message: 'Relatório não encontrado.' }, 404);
    }
    return new Response(JSON.stringify(report, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="mapscrape-report-${id}.json"`,
      },
    });
  } catch {
    return json({ error: 'report_query_failed', message: 'Erro ao consultar relatório.' }, 500);
  }
};
