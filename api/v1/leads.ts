import { authenticateRequest, sendAuthError, type AuthOk } from '@/src/server/auth';
import { getPlaces } from '@/src/server/db';

/**
 * GET /api/v1/leads — Pesquisa leads persistidos do consumidor autenticado.
 * Query: query, jobId, sortBy, sortOrder, limit (1-100, padrão 50), offset (>=0, padrão 0).
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

  const limitParam = Number(req.query?.limit ?? 50);
  const offsetParam = Number(req.query?.offset ?? 0);
  if (!Number.isFinite(limitParam) || limitParam < 1 || limitParam > 100) {
    res.status(422).json({ error: 'invalid_pagination', message: 'limit deve ser entre 1 e 100.' });
    return;
  }
  if (!Number.isFinite(offsetParam) || offsetParam < 0) {
    res.status(422).json({ error: 'invalid_pagination', message: 'offset deve ser >= 0.' });
    return;
  }

  const sortBy = req.query?.sortBy || 'collected_at';
  const sortOrder = req.query?.sortOrder || 'desc';

  try {
    const { places, total } = await getPlaces({
      jobId: req.query?.jobId || undefined,
      query: req.query?.query || undefined,
      category: req.query?.category || undefined,
      sortBy,
      sortOrder: sortOrder === 'asc' ? 'asc' : 'desc',
      limit: limitParam,
      offset: offsetParam,
      consumerProject: scope,
    });

    const hasMore = offsetParam + places.length < total;

    res.status(200).json({
      data: places.map((p) => toLead(p)),
      pagination: { total, limit: limitParam, offset: offsetParam, hasMore },
    });
  } catch (error) {
    res.status(500).json({ error: 'lead_query_failed', message: 'Erro ao consultar leads.' });
  }
}

function toLead(p: any) {
  return {
    id: p.id,
    job_id: p.job_id,
    name: p.name,
    category: p.category,
    address: p.address,
    phone: p.phone,
    website: p.website,
    rating: p.rating,
    review_count: p.review_count,
    price_range: p.price_range,
    opening_hours: p.opening_hours,
    business_status: p.business_status,
    latitude: p.latitude,
    longitude: p.longitude,
    maps_url: p.maps_url,
    description: p.description,
    services_attributes: p.services_attributes,
    photos: p.photos ? p.photos.split(' | ').filter(Boolean) : [],
    videos: p.videos ? p.videos.split(' | ').filter(Boolean) : [],
    logo_url: p.logo_url,
    booking_url: p.booking_url,
    social_links: p.social_links ? p.social_links.split(' | ').filter(Boolean) : [],
    reviews: p.reviews,
    review_topics: p.review_topics,
    additional_attributes: p.additional_attributes,
    media_items: p.media_items,
    plus_code: p.plus_code,
    collected_at: p.collected_at,
    postal_code: p.postal_code,
    country: p.country,
    city: p.city,
    state: p.state,
    source_place_id: p.source_place_id,
    source_url: p.source_url,
    popular_times: p.popular_times,
    rating_distribution: p.rating_distribution,
    review_highlights: p.review_highlights,
    field_status: p.field_status,
    attributes: p.attributes,
    accessibility_attributes: p.accessibility_attributes,
    next_opening_text: p.next_opening_text,
    next_open_day: p.next_open_day,
    next_open_time: p.next_open_time,
    visible_photos_count: p.visible_photos_count,
  };
}
