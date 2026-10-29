import { authenticateRequest, sendAuthError, type AuthOk } from '@/src/server/auth';
import { getAllPlaces } from '@/src/server/db';

/**
 * GET /api/v1/field-coverage — Calcula a taxa de preenchimento dos campos dos leads.
 * Query: jobId (opcional, filtra por coleta).
 * Autenticação: Bearer <MAPSCRAPE_API_KEY> ou Bearer <session Supabase>.
 */
export default async function handler(req: any, res: any): Promise<void> {
  const auth = await authenticateRequest(req.headers?.authorization);
  if (sendAuthError(res, auth)) return;
  const scope = (auth as AuthOk).context.scope;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Método não permitido.', message: 'Use GET.' });
    return;
  }

  const jobId = req.query?.jobId || undefined;

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

    res.status(200).json({
      totalRecords,
      totalFields,
      averageCoverage,
      fields,
    });
  } catch (error) {
    res.status(500).json({ error: 'field_coverage_failed', message: 'Erro ao calcular cobertura de campos.' });
  }
}
