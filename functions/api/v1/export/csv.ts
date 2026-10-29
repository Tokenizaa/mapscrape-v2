import { authenticateRequest, sendAuthError, type AuthOk } from '@/src/server/auth';
import { generateCsv } from '@/src/server/scraper/csv';
import { getAllPlaces, getPlacesByIds } from '@/src/server/db';
import { json, getBody } from '@/functions/_util';

export const onRequestPost = async (request: Request): Promise<Response> => {
  const auth = await authenticateRequest(request.headers.get('authorization'));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const scope = (auth as AuthOk).context.scope;

  const body = await getBody(request);
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

    return new Response('\uFEFF' + csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeName}.csv"`,
      },
    });
  } catch {
    return json({ error: 'csv_export_failed', message: 'Erro ao gerar arquivo CSV.' }, 500);
  }
};
