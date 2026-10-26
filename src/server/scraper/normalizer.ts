/**
 * Normalization module for Google Maps data fields.
 * Normalizes values without altering their factual meaning.
 */

export function cleanText(val: string | null | undefined): string {
  if (!val) return '';
  return val
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // remove zero-width spaces
    .replace(/[\uE000-\uF8FF]/g, '') // remove private-use unicode icons
    .trim();
}

export function normalizeAddress(raw: string | null | undefined): string {
  if (!raw) return '';
  let cleaned = cleanText(raw);
  // Remove "Endereço: " or "Address: " prefix if present from aria-label
  cleaned = cleaned.replace(/^(endereço|address|adresse|dirección):\s*/i, '');
  return cleaned.trim();
}

export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  let cleaned = cleanText(raw);
  // Remove "Telefone: " or "Phone: " prefix if present from aria-label
  cleaned = cleaned.replace(/^(telefone|phone|téléphone|teléfono):\s*/i, '');
  // Remove icon remnants
  cleaned = cleaned.replace(/^[\s]+/, '');
  return cleaned.trim();
}

export function normalizeWebsite(raw: string | null | undefined): string {
  if (!raw) return '';
  let cleaned = cleanText(raw);
  // Remove "Website: " or "Site: " prefix
  cleaned = cleaned.replace(/^(website|site|sito web|sitio web):\s*/i, '');
  cleaned = cleaned.replace(/^[\s]+/, '');
  return cleaned.trim();
}

export function normalizeCategory(raw: string | null | undefined): string {
  if (!raw) return '';
  let cleaned = cleanText(raw);
  // Remove trailing or leading bullet or dot
  cleaned = cleaned.replace(/^[·•\s]+|[·•\s]+$/g, '');
  return cleaned.trim();
}

export function normalizeRating(raw: string | null | undefined): string {
  if (!raw) return '';
  const cleaned = cleanText(raw);
  // Match rating like "4.5" or "4,5"
  const match = cleaned.match(/(\d+[.,]\d+)/);
  if (match) {
    return match[1];
  }
  return cleaned;
}

export function normalizeReviewCount(raw: string | null | undefined): string {
  if (!raw) return '';
  const cleaned = cleanText(raw);
  // Common formats: "(1.234)", "1.234 avaliações", "(58)"
  const match = cleaned.match(/([\d.,]+)\s*(?:avaliações|reviews)?/i);
  if (match) {
    // Keep numbers and periods/commas as formatted by Google
    return match[1].replace(/[()]/g, '').trim();
  }
  return cleaned.replace(/[()]/g, '').trim();
}

export function normalizePriceRange(raw: string | null | undefined): string {
  if (!raw) return '';
  let cleaned = cleanText(raw);
  cleaned = cleaned.replace(/^(preço|price|prix|precio):\s*/i, '');
  return cleaned.trim();
}

export function normalizeBusinessStatus(raw: string | null | undefined): string {
  if (!raw) return '';
  const cleaned = cleanText(raw).replace(/\s+/g, ' ').trim();
  // Maps may render a different language despite the requested pt-BR locale.
  if (/temporarily closed|fermé temporairement|cerrado temporalmente|fechado temporariamente/i.test(cleaned)) {
    return 'Fechado temporariamente';
  }
  if (/permanently closed|fermé définitivement|cerrado permanentemente|fechado permanentemente/i.test(cleaned)) {
    return 'Fechado permanentemente';
  }
  if (/(?:^|[^a-z])(?:open|ouvert|abierto|aberta|aberto)(?:$|[^a-z])/i.test(cleaned)) {
    const next = cleaned.match(/(?:closes|closing|ferme|fermera|fecha)\s+(?:at|à|a|às|as)?\s*([\d: h.]+)/i);
    return next ? `Aberto · fecha às ${next[1].trim()}` : 'Aberto';
  }
  if (/(?:^|[^a-z])(?:closed|fermé|fermée|cerrado|cerrada|fechado|fechada)(?:$|[^a-z])/i.test(cleaned)) {
    return 'Fechado';
  }
  return cleaned;
}

export function extractCoordinates(url: string | null | undefined): { latitude: string; longitude: string } {
  if (!url) return { latitude: '', longitude: '' };
  
  // Format 1: !3d-23.5634722!4d-46.6845054
  const match3d = url.match(/!3d(-?\d+(?:\.\d+)?)/);
  const match4d = url.match(/!4d(-?\d+(?:\.\d+)?)/);
  if (match3d && match4d) {
    return { latitude: match3d[1], longitude: match4d[1] };
  }

  // Format 2: @-23.5634722,-46.6845054
  const matchAt = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (matchAt) {
    return { latitude: matchAt[1], longitude: matchAt[2] };
  }

  return { latitude: '', longitude: '' };
}
