import { authenticateRequest, sendAuthError, type AuthOk } from '@/functions/_auth';
import { generateCsv } from '@/src/server/scraper/csv';
import { getAllPlaces, getPlacesByIds } from '@/src/server/db';
import { json, getRequest, getBodyJson } from '@/functions/_util';

export const onRequestPost = async (context: any): Promise<Response> => {
  const req = getRequest(context);
  const auth = await authenticateRequest(context);
  const err = sendAuthError(json, auth);
  if (err) return err;
  const authContext = auth as AuthOk;
  const scope = authContext.context.scope;

  const body = await getBodyJson(req);
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
