import { authenticateRequest, sendAuthError, type AuthOk } from '@/src/server/auth';
import { generateCsv } from '@/src/server/scraper/csv';
import { getAllPlaces, getPlacesByIds } from '@/src/server/db';

/**
 * POST /api/v1/export/csv — Gera e retorna um arquivo CSV com os leads do consumidor.
 * Body: { fields, filename, jobId?, placeIds? }
 * Autenticação: Bearer <MAPSCRAPE_API_KEY> ou Bearer <session Supabase>.
 */
export default async function handler(req: any, res: any): Promise<void> {
  const auth = await authenticateRequest(req.headers?.authorization);
  if (sendAuthError(res, auth)) return;
  const scope = (auth as AuthOk).context.scope;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Método não permitido.', message: 'Use POST.' });
    return;
  }

  let body: any;
  try {
    body = req.body || {};
  } catch {
    res.status(422).json({ error: 'invalid_request', message: 'Body JSON inválido.' });
    return;
  }

  const fields = Array.isArray(body?.fields) ? body.fields : undefined;
  const filename = body?.filename ? String(body.filename).trim() : 'mapscrape_export';
  const jobId = body?.jobId || undefined;
  const placeIds = Array.isArray(body?.placeIds) ? body.placeIds : undefined;

  try {
    let records: any[] = [];
    if (placeIds && placeIds.length > 0) {
      records = await getPlacesByIds(placeIds, scope);
    } else {
      records = await getAllPlaces(jobId, scope);
    }

    const csv = generateCsv(records, fields);

    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_') || 'mapscrape_export';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);
    res.status(200).send('\uFEFF' + csv);
  } catch (error) {
    res.status(500).json({ error: 'csv_export_failed', message: 'Erro ao gerar arquivo CSV.' });
  }
}
