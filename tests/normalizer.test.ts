import { describe, it, expect } from 'vitest';
import {
  normalizePhone,
  normalizeAddress,
  normalizeCategory,
  normalizeRating,
  normalizeReviewCount,
  normalizeBusinessStatus,
  normalizePriceRange,
  extractCoordinates,
  parseAddressComponents,
  extractSourcePlaceId,
} from '../src/server/scraper/normalizer';

describe('Normalizer Module', () => {
  it('normalizes phone numbers without altering numbers', () => {
    expect(normalizePhone('Telefone: +55 11 98765-4321')).toBe('+55 11 98765-4321');
    expect(normalizePhone('Phone: (41) 3333-2222')).toBe('(41) 3333-2222');
    expect(normalizePhone(' +55 15 98102-0706')).toBe('+55 15 98102-0706');
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone(undefined)).toBe('');
  });

  it('normalizes addresses removing metadata prefixes', () => {
    expect(normalizeAddress('Endereço: R. Mateus Grou, 282 - Pinheiros, São Paulo - SP')).toBe(
      'R. Mateus Grou, 282 - Pinheiros, São Paulo - SP'
    );
    expect(normalizeAddress('Address: 123 Main St')).toBe('123 Main St');
    expect(normalizeAddress('')).toBe('');
  });

  it('normalizes category removing bullet points', () => {
    expect(normalizeCategory('• Padaria •')).toBe('Padaria');
    expect(normalizeCategory('· Restaurante italiano ·')).toBe('Restaurante italiano');
    expect(normalizeCategory('Clínica odontológica')).toBe('Clínica odontológica');
  });

  it('normalizes rating to clean decimal format', () => {
    expect(normalizeRating('4,4 estrelas')).toBe('4,4');
    expect(normalizeRating('4.8')).toBe('4.8');
    expect(normalizeRating('5,0')).toBe('5,0');
    expect(normalizeRating('')).toBe('');
  });

  it('normalizes review counts removing parentheses and suffixes', () => {
    expect(normalizeReviewCount('(1.234)')).toBe('1.234');
    expect(normalizeReviewCount('58 avaliações')).toBe('58');
    expect(normalizeReviewCount('(950 avaliações)')).toBe('950');
  });

  it('normalizes business status cleanly', () => {
    expect(normalizeBusinessStatus('Aberto ⋅ Fecha às 22:00')).toContain('Aberto');
    expect(normalizeBusinessStatus('Fechado permanentemente')).toBe('Fechado permanentemente');
    expect(normalizeBusinessStatus('Fechado temporariamente')).toBe('Fechado temporariamente');
  });

  it('parses structured components from observed Google Maps addresses without mistaking street numbers for postal codes', () => {
    expect(parseAddressComponents(
      'Alameda Joaquim Eugênio de Lima, 1756 - Jardim Paulista, São Paulo - SP, 01403-002, Brazil'
    )).toEqual({ postal_code: '01403-002', country: 'Brazil', city: 'São Paulo', state: 'SP' });

    expect(parseAddressComponents(
      'Augusta St, 1140 - Consolação, São Paulo - SP 01413-100, Brazil'
    )).toEqual({ postal_code: '01413-100', country: 'Brazil', city: 'São Paulo', state: 'SP' });

    expect(parseAddressComponents('Rua sem CEP, Porto Alegre - RS, Brazil')).toEqual({
      postal_code: '', country: 'Brazil', city: 'Porto Alegre', state: 'RS',
    });
  });

  it('extracts a Maps place identifier only when it exists in the URL', () => {
    expect(extractSourcePlaceId('https://www.google.com/maps/place/Test/data=!1s0x94ce59e8ef43b0db:0x50225dda5a2046ee!8m2'))
      .toBe('0x94ce59e8ef43b0db:0x50225dda5a2046ee');
    expect(extractSourcePlaceId('https://www.google.com/maps/@-23.55,-46.65,17z')).toBe('');
  });

  it('extracts coordinates from URLs correctly', () => {
    const url1 =
      'https://www.google.com/maps/place/Padaria/data=!4m7!3m6!1s0x0!8m2!3d-23.5634722!4d-46.6845054!16s';
    const coords1 = extractCoordinates(url1);
    expect(coords1.latitude).toBe('-23.5634722');
    expect(coords1.longitude).toBe('-46.6845054');

    const url2 = 'https://www.google.com/maps/@-25.4284,-49.2733,15z';
    const coords2 = extractCoordinates(url2);
    expect(coords2.latitude).toBe('-25.4284');
    expect(coords2.longitude).toBe('-49.2733');

    const coordsEmpty = extractCoordinates('https://google.com');
    expect(coordsEmpty.latitude).toBe('');
    expect(coordsEmpty.longitude).toBe('');
  });

  it('handles missing fields gracefully by returning empty strings without errors', () => {
    expect(normalizeAddress(undefined)).toBe('');
    expect(normalizePhone(null)).toBe('');
    expect(normalizeCategory(undefined)).toBe('');
    expect(normalizeRating(undefined)).toBe('');
    expect(normalizeReviewCount(undefined)).toBe('');
    expect(normalizePriceRange(undefined)).toBe('');
    expect(normalizeBusinessStatus(undefined)).toBe('');
  });
});
