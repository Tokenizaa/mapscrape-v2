import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createJob,
  getJob,
  getPlaces,
  getPlacesByIds,
  initDb,
  insertPlace,
  updatePlace,
  placeExistsByUrl,
} from '../src/server/db';
import type { PlaceRecord, ScrapeJob } from '../src/shared/types';

const testJobId = `db_test_${Date.now()}`;
const mapsUrl = 'https://www.google.com/maps/place/DB+Test+Cafe/data=!123';

const job: ScrapeJob = {
  id: testJobId,
  user_id: 'test-user',
  segment: 'Cafeterias',
  location: 'Curitiba, PR',
  limit_requested: 2,
  status: 'running',
  status_message: 'Teste de integração',
  total_found: 0,
  total_collected: 0,
  total_duplicates: 0,
  total_errors: 0,
  current_step: 'Iniciando',
  created_at: new Date().toISOString(),
};

const place: PlaceRecord = {
  id: `${testJobId}_place`,
  job_id: testJobId,
  name: 'DB Test Cafe',
  category: 'Cafeteria',
  address: 'Curitiba, PR',
  phone: '',
  website: '',
  rating: '4.5',
  review_count: '10',
  price_range: '$$',
  opening_hours: '',
  business_status: 'Aberto',
  latitude: '-25.4284',
  longitude: '-49.2733',
  maps_url: mapsUrl,
  description: '',
  services_attributes: '',
  photos: 'https://example.com/photo.jpg',
  videos: '',
  logo_url: '',
  booking_url: 'https://example.com/book',
  social_links: 'https://instagram.com/example',
  reviews: JSON.stringify([{ id: 'review-1', text: 'Ótimo atendimento' }]),
  review_topics: JSON.stringify([{ label: 'atendimento', count: '5' }]),
  additional_attributes: JSON.stringify({ about_text: 'Público' }),
  media_items: JSON.stringify([{ type: 'image', url: 'https://example.com/photo.jpg', thumbnail_url: 'https://example.com/thumb.jpg' }]),
  plus_code: 'C8GR+68',
  attributes: JSON.stringify(['LGBTQ+ friendly']),
  accessibility_attributes: JSON.stringify(['Entrada acessível']),
  next_opening_text: 'Opens 10 AM Tue',
  next_open_day: 'Tue',
  next_open_time: '10 AM',
  visible_photos_count: '187',
  postal_code: '01403-002',
  country: 'Brazil',
  city: 'São Paulo',
  state: 'SP',
  source_place_id: '0x94ce59e8ef43b0db:0x50225dda5a2046ee',
  source_url: mapsUrl,
  popular_times: JSON.stringify([{ day: 'Tue', hour: '10 AM', busyness: 20 }]),
  rating_distribution: JSON.stringify({ '5': 9, '4': 1 }),
  review_highlights: JSON.stringify(['Ótimo atendimento']),
  field_status: JSON.stringify({ rating: { status: 'captured' } }),
  collected_at: new Date().toISOString(),
};

describe.skipIf(!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)('Database persistence', () => {
  beforeAll(async () => {
    await initDb();
  });

  afterAll(async () => {
    // Keep the shared database intact; test rows use unique IDs to avoid collisions.
  });

  it('creates and retrieves a scrape job including its owner', async () => {
    await createJob(job);

    const result = await getJob(testJobId);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(testJobId);
    expect(result?.user_id).toBe('test-user');
    expect(result?.segment).toBe('Cafeterias');
    expect(result?.location).toBe('Curitiba, PR');
    expect(await getJob(testJobId, 'test-user')).not.toBeNull();
    expect(await getJob(testJobId, 'other-consumer')).toBeNull();
  });

  it('persists a place and detects duplicate Google Maps URLs', async () => {
    await insertPlace(place);

    expect(await placeExistsByUrl(mapsUrl, testJobId)).toBe(true);
    expect(await placeExistsByUrl(`${mapsUrl}?hl=pt-BR`)).toBe(true);
    expect(await placeExistsByUrl('https://maps.google.com/not-found', testJobId)).toBe(false);

    const result = await getPlaces({ jobId: testJobId });
    expect(result.total).toBe(1);
    expect(result.places[0]?.name).toBe('DB Test Cafe');
    expect(result.places[0]?.photos).toContain('photo.jpg');
    expect(result.places[0]?.booking_url).toBe('https://example.com/book');
    expect(result.places[0]?.city).toBe('São Paulo');
    expect(result.places[0]?.postal_code).toBe('01403-002');
    expect(JSON.parse(result.places[0]?.attributes || '[]')).toContain('LGBTQ+ friendly');
    expect(JSON.parse(result.places[0]?.accessibility_attributes || '[]')).toContain('Entrada acessível');
    expect(JSON.parse(result.places[0]?.popular_times || '[]')).toHaveLength(1);
    expect(JSON.parse(result.places[0]?.rating_distribution || '{}')['5']).toBe(9);
    expect(JSON.parse(result.places[0]?.review_highlights || '[]')).toContain('Ótimo atendimento');
    expect(JSON.parse(result.places[0]?.field_status || '{}').rating.status).toBe('captured');

    await updatePlace(place.id, { ...place, city: 'Porto Alegre', state: 'RS', review_highlights: JSON.stringify(['Atualizado']) });
    const updated = await getPlaces({ jobId: testJobId });
    expect(updated.places[0]?.city).toBe('Porto Alegre');
    expect(JSON.parse(updated.places[0]?.review_highlights || '[]')).toEqual(['Atualizado']);

    const ownerResults = await getPlaces({ jobId: testJobId, consumerProject: 'test-user' });
    const otherResults = await getPlaces({ jobId: testJobId, consumerProject: 'other-consumer' });
    expect(ownerResults.total).toBe(1);
    expect(otherResults.total).toBe(0);
    expect(await getPlacesByIds([place.id], 'test-user')).toHaveLength(1);
    expect(await getPlacesByIds([place.id], 'other-consumer')).toHaveLength(0);
  });
});
