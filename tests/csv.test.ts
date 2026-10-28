import { describe, it, expect } from 'vitest';
import { sanitizeCsvCell, generateCsv } from '../src/server/scraper/csv';
import { EXPORTABLE_FIELDS, PlaceRecord } from '../src/shared/types';

describe('CSV Module and Formula Sanitization', () => {
  it('exports each public PlaceRecord field exactly once and excludes internal identifiers', () => {
    const keys = EXPORTABLE_FIELDS.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain('id');
    expect(keys).not.toContain('job_id');
    expect(keys).toEqual(expect.arrayContaining([
      'name', 'category', 'address', 'phone', 'website', 'rating', 'review_count',
      'price_range', 'opening_hours', 'business_status', 'latitude', 'longitude',
      'maps_url', 'description', 'services_attributes', 'photos', 'videos', 'logo_url',
      'booking_url', 'social_links', 'reviews', 'review_topics', 'additional_attributes',
      'media_items', 'plus_code', 'postal_code', 'country', 'city', 'state',
      'source_place_id', 'source_url', 'attributes', 'accessibility_attributes',
      'next_opening_text', 'next_open_day', 'next_open_time', 'visible_photos_count',
      'popular_times', 'rating_distribution', 'review_highlights', 'field_status', 'collected_at',
    ]));
  });

  it('protects against malicious Excel formula injection starting with =, +, -, @', () => {
    expect(sanitizeCsvCell('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
    expect(sanitizeCsvCell('+cmd|/c calc')).toBe("'+cmd|/c calc");
    expect(sanitizeCsvCell('-123+456')).toBe("'-123+456");
    expect(sanitizeCsvCell('@IMPORTXML("url")')).toBe('"\'@IMPORTXML(""url"")"');
  });

  it('protects formulas preceded by whitespace or control characters', () => {
    expect(sanitizeCsvCell('  =1+1')).toBe("'  =1+1");
    expect(sanitizeCsvCell('\t@SUM(A1)')).toBe("'\t@SUM(A1)");
  });

  it('escapes quotes and handles commas and newlines properly', () => {
    expect(sanitizeCsvCell('Padaria, Confeitaria e Bar')).toBe('"Padaria, Confeitaria e Bar"');
    expect(sanitizeCsvCell('Restaurante "O Pescador"')).toBe('"Restaurante ""O Pescador"""');
    expect(sanitizeCsvCell("Linha 1\nLinha 2")).toBe("\"Linha 1\nLinha 2\"");
  });

  it('generates full CSV with UTF-8 BOM and correct headers', () => {
    const dummyRecord: PlaceRecord = {
      id: 'p1',
      job_id: 'j1',
      name: 'Padaria Central',
      category: 'Padaria',
      address: 'Rua das Flores, 100',
      phone: '(11) 98765-4321',
      website: 'https://padariacentral.com.br',
      rating: '4.7',
      review_count: '150',
      price_range: '$$',
      opening_hours: 'Seg-Sex: 07:00-20:00',
      business_status: 'Aberto',
      latitude: '-23.5505',
      longitude: '-46.6333',
      maps_url: 'https://maps.google.com/?cid=12345',
      description: 'Pães artesanais e café fresco',
      services_attributes: 'Consumo no local · Entrega',
      photos: 'https://lh5.googleusercontent.com/photo.jpg',
      videos: 'https://maps.google.com/video.mp4',
      logo_url: 'https://lh5.googleusercontent.com/logo.jpg',
      collected_at: '2026-10-25T15:00:00Z',
    };

    const csv = generateCsv([dummyRecord]);

    // Check UTF-8 BOM
    expect(csv.startsWith('\uFEFF')).toBe(true);

    // Check header presence
    expect(csv).toContain('Nome do estabelecimento');
    expect(csv).toContain('Telefone');
    expect(csv).toContain('Fotos (URLs)');
    expect(csv).toContain('Vídeos (URLs)');
    expect(csv).toContain('Logo / Foto de perfil');
    expect(csv).toContain('Link do Google Maps');

    // Check data row
    expect(csv).toContain('Padaria Central');
    expect(csv).toContain('"Rua das Flores, 100"');
    expect(csv).toContain('(11) 98765-4321');
    expect(csv).toContain('https://maps.google.com/video.mp4');
  });

  it('supports exporting only user-selected columns', () => {
    const dummyRecord: PlaceRecord = {
      id: 'p2',
      job_id: 'j2',
      name: 'Farmácia Popular',
      category: 'Farmácia',
      address: 'Av. Paulista, 1000',
      phone: '(11) 3232-1111',
      website: '',
      rating: '4.5',
      review_count: '30',
      price_range: '',
      opening_hours: '',
      business_status: 'Aberto',
      latitude: '',
      longitude: '',
      maps_url: 'https://maps.google.com/?cid=999',
      description: '',
      services_attributes: '',
      collected_at: '2026-10-25T15:00:00Z',
    };

    const csv = generateCsv([dummyRecord], ['name', 'phone', 'address']);

    // Headers only for selected columns
    expect(csv).toContain('Nome do estabelecimento,Telefone,Endereço');
    expect(csv).not.toContain('Link do Google Maps');
    expect(csv).toContain('Farmácia Popular,(11) 3232-1111,"Av. Paulista, 1000"');
  });
});
