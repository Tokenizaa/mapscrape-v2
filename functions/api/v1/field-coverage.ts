import { authenticateRequest, sendAuthError, type AuthOk } from '@/src/server/auth';
import { getAllPlaces } from '@/src/server/db';
import { json, getQuery } from '@/functions/_util';

export const onRequestGet = async (request: Request): Promise<Response> => {
  const auth = await authenticateRequest(request.headers.get('authorization'));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const scope = (auth as AuthOk).context.scope;

  const q = getQuery(request.url);
  const jobId = q.jobId || undefined;

  try {
    const places = await getAllPlaces(jobId, scope);
    const totalRecords = places.length;

    const coverageFields: { key: string; label: string }[] = [
      { key: 'name', label: 'Nome' },
      { key: 'category', label: 'Categoria' },
      { key: 'address', label: 'Endereço' },
      { key: 'phone', label: 'Telefone' },
      { key: 'website', label: 'Site' },
      { key: 'rating', label: 'Nota' },
      { key: 'review_count', label: 'Avaliações' },
      { key: 'price_range', label: 'Faixa de preço' },
      { key: 'business_status', label: 'Status de funcionamento' },
      { key: 'opening_hours', label: 'Horários' },
      { key: 'latitude', label: 'Latitude' },
      { key: 'longitude', label: 'Longitude' },
      { key: 'maps_url', label: 'Link do Maps' },
      { key: 'description', label: 'Descrição' },
      { key: 'photos', label: 'Fotos' },
      { key: 'city', label: 'Cidade' },
      { key: 'state', label: 'Estado' },
      { key: 'collected_at', label: 'Data da coleta' },
    ];

    const fields = coverageFields.map((f) => {
      let populated = 0;
      for (const p of places) {
        const v = String((p as any)[f.key] ?? '').trim();
        if (v && v !== '[]' && v !== '{}') populated++;
      }
      const percentage = totalRecords > 0 ? Math.round((populated / totalRecords) * 100) : 0;
      return { key: f.key, label: f.label, populated, missing: totalRecords - populated, percentage };
    });

    const totalFields = fields.length;
    const averageCoverage =
      totalRecords > 0 && totalFields > 0
        ? Math.round((fields.reduce((sum, f) => sum + f.percentage, 0) / totalFields))
        : 0;

    return json({ totalRecords, totalFields, averageCoverage, fields });
  } catch {
    return json({ error: 'field_coverage_failed', message: 'Erro ao calcular cobertura de campos.' }, 500);
  }
};
