import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createJob,
  getJob,
  getPlaces,
  initDb,
  insertPlace,
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
  collected_at: new Date().toISOString(),
};

describe('Database persistence', () => {
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
  });
});
