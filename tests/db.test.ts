import { describe, it, expect, beforeAll } from 'vitest';
import { initDb, createJob, getJob, insertPlace, getPlaces, placeExistsByUrl } from '../src/server/db';
import { PlaceRecord, ScrapeJob } from '../src/shared/types';

describe('SQLite Database Operations', () => {
  const testJobId = `test_job_${Date.now()}`;

  beforeAll(async () => {
    await initDb();
  });

  it('creates and retrieves a search job', async () => {
    const job: ScrapeJob = {
      id: testJobId,
      segment: 'Cafés Especiais',
      location: 'Curitiba, PR',
      limit_requested: 10,
      status: 'running',
      status_message: 'Pesquisando...',
      total_found: 0,
      total_collected: 0,
      total_duplicates: 0,
      total_errors: 0,
      current_step: 'Iniciando',
      created_at: new Date().toISOString(),
    };

    await createJob(job);
    const retrieved = await getJob(testJobId);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.segment).toBe('Cafés Especiais');
    expect(retrieved?.location).toBe('Curitiba, PR');
    expect(retrieved?.limit_requested).toBe(10);
  });

  it('inserts places and performs deduplication check by maps_url', async () => {
    const mapsUrl = 'https://www.google.com/maps/place/Cafe+Lucca/data=!123';
    const place: PlaceRecord = {
      id: `p_${Date.now()}`,
      job_id: testJobId,
      user_id: "dev-user-1",
      name: 'Lucca Cafés Especiais',
      category: 'Cafeteria',
      address: 'Alameda Pres. Taunay, 40 - Batel, Curitiba - PR',
      phone: '(41) 3016-4668',
      website: 'https://luccacafes.com.br',
      rating: '4.6',
      review_count: '2.400',
      price_range: '$$',
      opening_hours: 'Seg-Dom 08:00 - 20:00',
      business_status: 'Aberto',
      latitude: '-25.4385',
      longitude: '-49.2847',
      maps_url: mapsUrl,
      description: 'Cafés especiais torrados no local.',
      services_attributes: 'Consumo no local · Retirada na porta',
      photos: 'https://lh5.googleusercontent.com/p/photo1.jpg | https://lh5.googleusercontent.com/p/photo2.jpg',
      videos: 'https://maps.google.com/video1.mp4',
      logo_url: 'https://lh5.googleusercontent.com/p/logo.jpg',
      collected_at: new Date().toISOString(),
    };

    await insertPlace(place);

    const exists = await placeExistsByUrl(mapsUrl, testJobId);
    expect(exists).toBe(true);
    expect(await placeExistsByUrl(`${mapsUrl}?authuser=0&hl=pt-BR`)).toBe(true);
    expect(await placeExistsByUrl(`${mapsUrl}/`)).toBe(true);

    const notExists = await placeExistsByUrl('https://maps.google.com/notfound', testJobId);
    expect(notExists).toBe(false);

    const results = await getPlaces({ jobId: testJobId });
    expect(results.total).toBeGreaterThanOrEqual(1);
    const foundPlace = results.places.find(p => p.name === 'Lucca Cafés Especiais');
    expect(foundPlace).toBeDefined();
    expect(foundPlace?.videos).toBe('https://maps.google.com/video1.mp4');
    expect(foundPlace?.photos).toContain('photo1.jpg');
  });
});
