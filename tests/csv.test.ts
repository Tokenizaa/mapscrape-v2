import { describe, it, expect } from 'vitest';
import { sanitizeCsvCell, generateCsv } from '../src/server/scraper/csv';
import { PlaceRecord } from '../src/shared/types';

describe('CSV Module and Formula Sanitization', () => {
  it('protects against malicious Excel formula injection starting with =, +, -, @', () => {
    expect(sanitizeCsvCell('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
    expect(sanitizeCsvCell('+cmd|/c calc')).toBe("'+cmd|/c calc");
    expect(sanitizeCsvCell('-123+456')).toBe("'-123+456");
    expect(sanitizeCsvCell('@IMPORTXML("url")')).toBe('"\'@IMPORTXML(""url"")"');
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
      collected_at: '2026-10-25T15:00:00Z',
    };

    const csv = generateCsv([dummyRecord]);

    // Check UTF-8 BOM
    expect(csv.startsWith('\uFEFF')).toBe(true);

    // Check header presence
    expect(csv).toContain('Nome do estabelecimento');
    expect(csv).toContain('Telefone');
    expect(csv).toContain('Link do Google Maps');

    // Check data row
    expect(csv).toContain('Padaria Central');
    expect(csv).toContain('"Rua das Flores, 100"');
    expect(csv).toContain('(11) 98765-4321');
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
