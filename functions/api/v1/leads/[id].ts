import { authenticateRequest, sendAuthError, type AuthOk } from '@/functions/_auth';
import { getPlacesByIds } from '@/src/server/db';
import { json, getRequest, getParams } from '@/functions/_util';

function toLead(p: any) {
  return {
    id: p.id, job_id: p.job_id, name: p.name, category: p.category, address: p.address,
    phone: p.phone, website: p.website, rating: p.rating, review_count: p.review_count,
    price_range: p.price_range, opening_hours: p.opening_hours, business_status: p.business_status,
    latitude: p.latitude, longitude: p.longitude, maps_url: p.maps_url, description: p.description,
    services_attributes: p.services_attributes,
    photos: p.photos ? p.photos.split(' | ').filter(Boolean) : [],
    videos: p.videos ? p.videos.split(' | ').filter(Boolean) : [],
    logo_url: p.logo_url, booking_url: p.booking_url,
    social_links: p.social_links ? p.social_links.split(' | ').filter(Boolean) : [],
    reviews: p.reviews, review_topics: p.review_topics, additional_attributes: p.additional_attributes,
    media_items: p.media_items, plus_code: p.plus_code, collected_at: p.collected_at,
    postal_code: p.postal_code, country: p.country, city: p.city, state: p.state,
    source_place_id: p.source_place_id, source_url: p.source_url, popular_times: p.popular_times,
    rating_distribution: p.rating_distribution, review_highlights: p.review_highlights,
    field_status: p.field_status, attributes: p.attributes,
    accessibility_attributes: p.accessibility_attributes, next_opening_text: p.next_opening_text,
    next_open_day: p.next_open_day, next_open_time: p.next_open_time,
    visible_photos_count: p.visible_photos_count,
  };
}

export const onRequestGet = async (context: any): Promise<Response> => {
  const req = getRequest(context);
  const auth = await authenticateRequest(context);
  const err = sendAuthError(json, auth);
  if (err) return err;
  const authContext = auth as AuthOk;
  const scope = authContext.context.scope;
  const params = getParams(context);
  const id = params.id;
  if (!id) return json({ error: 'lead_not_found', message: 'Lead não encontrado.' }, 404);

  try {
    const places = await getPlacesByIds([id], scope);
    const place = places[0];
    if (!place) return json({ error: 'lead_not_found', message: 'Lead inexistente ou fora do escopo.' }, 404);
    return json({ data: toLead(place) });
  } catch {
    return json({ error: 'lead_query_failed', message: 'Erro ao consultar lead.' }, 500);
  }
};
