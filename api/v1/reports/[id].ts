import { authenticateRequest, sendAuthError, type AuthOk } from '@/src/server/auth';
import { readRunReport } from '@/src/server/run-report';

/**
 * GET /api/v1/reports/{id} — Retorna o relatório de execução (JSON) de uma coleta.
 * Autenticação: Bearer <MAPSCRAPE_API_KEY> ou Bearer <session Supabase>.
 */
export default async function handler(req: any, res: any): Promise<void> {
  const auth = await authenticateRequest(req.headers?.authorization);
  if (sendAuthError(res, auth)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Método não permitido.', message: 'Use GET.' });
    return;
  }

  const id = req.query?.id || req.params?.id;
  if (!id || !/^[a-zA-Z0-9_-]{1,160}$/.test(String(id))) {
    res.status(404).json({ error: 'report_not_found', message: 'Relatório não encontrado.' });
    return;
  }

  try {
    const report = await readRunReport(String(id));
    if (!report) {
      res.status(404).json({ error: 'report_not_found', message: 'Relatório não encontrado.' });
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="mapscrape-report-${id}.json"`);
    res.status(200).send(JSON.stringify(report, null, 2));
  } catch (error) {
    res.status(500).json({ error: 'report_query_failed', message: 'Erro ao consultar relatório.' });
  }
}
