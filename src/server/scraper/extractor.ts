import { Page } from 'puppeteer';
import { PlaceRecord } from '../../shared/types';
import {
  cleanText, normalizeAddress, normalizePhone, normalizeWebsite, normalizeCategory,
  normalizeRating, normalizeReviewCount, normalizePriceRange, normalizeBusinessStatus,
  extractCoordinates,
} from './normalizer';
import { SELECTORS } from './selectors';

/**
 * Extract only values actually rendered on the public Maps place sheet.
 * Prefer semantic data-item-id/aria-label attributes over unstable CSS classes.
 */
export async function extractPlaceDetails(page: Page, jobId: string, targetUrl: string): Promise<PlaceRecord> {
  // Google Maps collapses the weekly schedule by default. Expand it before reading
  // the DOM so we capture all visible days instead of only the current-day row.
  try {
    await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('button'));
      const hoursButton = candidates.find((button) => {
        const label = [button.getAttribute('aria-label') || '', button.innerText || ''].join(' ');
        return button.getAttribute('data-item-id') === 'oh' ||
          /horários de funcionamento|opening hours|horario de apertura|heures d.?ouverture/i.test(label);
      });
      if (hoursButton) hoursButton.click();
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
  } catch {
    // Expansion is best-effort; extraction should continue if the UI changes.
  }

  const raw: any = await page.evaluate((selectors: typeof SELECTORS.place) => {
    if (typeof (window as any).__name === 'undefined') (window as any).__name = (f: any) => f;
    if (typeof (globalThis as any).__name === 'undefined') (globalThis as any).__name = (f: any) => f;

    const text = (el: Element | null): string => (el as HTMLElement | null)?.innerText?.trim() || '';
    const attr = (el: Element | null, name: string): string => el?.getAttribute(name)?.trim() || '';
    const first = (sels: string[]): Element | null => {
      for (const selector of sels) {
        try { const el = document.querySelector(selector); if (el) return el; } catch {}
      }
      return null;
    };
    const firstText = (sels: string[]): string => {
      for (const selector of sels) {
        try { const el = document.querySelector(selector); const value = text(el); if (value) return value; } catch {}
      }
      return '';
    };
    const firstAttr = (sels: string[], name: string): string => {
      for (const selector of sels) {
        try { const el = document.querySelector(selector); const value = attr(el, name); if (value) return value; } catch {}
      }
      return '';
    };
    const cleanLabel = (value: string): string => value.replace(/^(endereço|address|adresse|dirección|telefone|phone|téléphone|teléfono|site|website|sito web|sitio web|preço|price|prix)\s*:\s*/i, '').trim();

    const name = firstText(selectors.title);
    const category = firstText(selectors.category);

    // Maps commonly puts rating and review count together in one accessible label.
    const ratingNode = first([
      'div.F7nice span[aria-hidden="true"]',
      'span[role="img"][aria-label*="estrelas"]',
      'span[role="img"][aria-label*="stars"]',
      'div.F7nice span[aria-label*="star"]',
      'div.F7nice span[aria-label*="estrela"]',
      ...selectors.rating,
    ]);
    const ratingLabel = [attr(ratingNode, 'aria-label'), text(ratingNode)].filter(Boolean).join(' ');
    const ratingMatch = ratingLabel.match(/([0-5][.,]\d)/);
    const rating = ratingMatch?.[1] || firstText(selectors.rating);
    const reviewNode = first([
      'div.F7nice button[aria-label]',
      'button[jsaction*="pane.reviewChart.moreReviews"]',
      ...selectors.reviews,
    ]);
    const reviewLabel = [attr(reviewNode, 'aria-label'), text(reviewNode)].filter(Boolean).join(' ');
    const parseReviewCount = (value: string): string => {
      const normalized = value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      // Prefer explicitly labelled counts, including localized "mil" / "K" forms.
      const labeled = normalized.match(/(\d{1,3}(?:[.\s]\d{3})+|\d+(?:[.,]\d+)?(?:\s*(?:mil|k|thousand))?)\s*(?:avaliações?|reviews?|opiniones?|avis|bewertung(?:en)?|recensioni)/i);
      if (labeled) return labeled[1].trim();
      // Maps often renders "4,7 (587)" or "4,9 (1,2 mil)" in the rating cluster.
      const parenthesized = normalized.match(/[([]\s*([\d][\d\s.,]*(?:\s*(?:mil|k))?)\s*[)\]]/i);
      if (parenthesized && !/^\d[.,]\d$/.test(parenthesized[1].trim())) return parenthesized[1].trim();
      // A bare integer/grouped integer is a count; a decimal like 4.7 is not.
      const bareCount = normalized.match(/^\(?\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*\)?$/);
      return bareCount?.[1] || '';
    };
    // Google changes nested markup frequently. Read the rating cluster and all
    // review-related accessible labels instead of trusting one CSS selector.
    const ratingCluster = first(['div.F7nice', 'div[role="main"] div.F7nice']);
    const reviewSources = [
      reviewLabel,
      ratingLabel,
      text(ratingCluster),
      attr(ratingCluster, 'aria-label'),
      ...Array.from(document.querySelectorAll(
        'button[jsaction*="pane.reviewChart.moreReviews"], [aria-label*="avaliações"], [aria-label*="reviews"], [aria-label*="opiniones"], [aria-label*="recensioni"]'
      )).map((el) => [attr(el, 'aria-label'), text(el)].filter(Boolean).join(' ')),
      ...Array.from(ratingCluster?.querySelectorAll('span,button') || []).map((el) =>
        [attr(el, 'aria-label'), text(el)].filter(Boolean).join(' ')
      ),
    ].filter(Boolean);
    const review_count = reviewSources.map(parseReviewCount).find(Boolean) || '';

    const addressNode = first(['button[data-item-id="address"]', '[data-item-id="address"]', ...selectors.address]);
    const phoneNode = first(['button[data-item-id^="phone:tel:"]', 'button[data-item-id^="phone:"]', ...selectors.phone]);
    const websiteNode = first(['a[data-item-id="authority"][href]', ...selectors.website]);
    const priceNode = first([
      'span[aria-label^="Preço:"]', 'span[aria-label^="Price:"]',
      'span[aria-label^="Prix:"]', 'span[aria-label^="Precio:"]',
      ...selectors.priceRange,
    ]);

    const address = cleanLabel(attr(addressNode, 'aria-label') || text(addressNode));
    const phone = cleanLabel(attr(phoneNode, 'aria-label') || text(phoneNode));
    // Save the URL shown by Maps only; never visit it.
    const website = attr(websiteNode, 'href') || cleanLabel(attr(websiteNode, 'aria-label') || text(websiteNode));
    const price_range = cleanLabel(attr(priceNode, 'aria-label') || text(priceNode));

    // Capture the visible weekly schedule as rows, rather than one generic wrapper
    // whose text may only say "Horários" or "Aberto".
    const hoursTable = first([
      'table[aria-label*="Horário"]', 'table[aria-label*="Hours"]',
      'table[aria-label*="Heures"]', 'table[aria-label*="Horario"]',
      'table.eKjhbv',
    ]) || Array.from(document.querySelectorAll('table')).find((table) =>
      Array.from(table.querySelectorAll('tr')).some((row) =>
        /segunda|terça|quarta|quinta|sexta|sábado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche/i.test(text(row))
      )
    ) || null;
    let opening_hours = '';
    if (hoursTable) {
      opening_hours = Array.from(hoursTable.querySelectorAll('tr'))
        .map((row) => text(row).replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join(' | ');
    }
    if (!opening_hours) {
      const hoursButton = first([
        'button[data-item-id="oh"]', 'button[aria-label*="Horários de funcionamento"]',
        'button[aria-label*="Opening hours"]', 'button[aria-label*="Heures d’ouverture"]',
        'button[aria-label*="Horario de apertura"]',
      ]);
      opening_hours = text(hoursButton) || attr(hoursButton, 'aria-label');
    }

    const statusCandidates = Array.from(document.querySelectorAll(
      '[aria-label*="Aberto"], [aria-label*="Fechado"], [aria-label*="Open"], [aria-label*="Closed"],' +
      '[aria-label*="Fermé"], [aria-label*="Ouvert"], [aria-label*="Cerrado"], [aria-label*="Abierto"],' +
      '.ZDu9vd, .o0Svhf'
    ));
    const statusText = statusCandidates.map((el) => attr(el, 'aria-label') || text(el))
      .find((value) => /aberto|fechado|open|closed|fermé|fermée|ouvert|abierto|cerrado/i.test(value)) || '';

    // Prefer explicit business description/summary fields and avoid generic
    // container text that merely repeats navigation labels.
    const description = firstText([
      '[data-item-id="description"]',
      '[aria-label*="Descrição"]',
      '[aria-label*="From the business"]',
      '[aria-label*="Da empresa"]',
      ...selectors.description,
    ]);
    const serviceEls = Array.from(document.querySelectorAll([
      '[aria-label*="Serviços"]',
      '[aria-label*="Services"]',
      '[data-item-id*="service"]',
      ...selectors.services,
    ].join(', ')));
    const services_attributes = Array.from(new Set(serviceEls
      .map(text)
      .map((value) => value.replace(/\s+/g, ' ').trim())
      .filter((value) => value && value.length < 1200 && !/^(serviços|services|acessibilidade|accessibility)$/i.test(value))))
      .join(' · ');

    const photoUrls: string[] = [];
    const seenPhotos = new Set<string>();
    const addPhoto = (candidate: string): void => {
      const src = (candidate || '').trim().split(/\s+/)[0];
      if (!src.startsWith('http') || /cleardot\.gif|gstatic\.com\/images\/branding/i.test(src)) return;
      // Ignore tiny UI icons and avatars; retain Google-hosted business/gallery media.
      if (/=s(\d{1,2}|\d{1,2}-c)$/.test(src)) return;
      if (!seenPhotos.has(src)) { seenPhotos.add(src); photoUrls.push(src); }
    };
    for (const selector of selectors.photos) {
      try {
        document.querySelectorAll(selector).forEach((el) => {
          const image = el as HTMLImageElement;
          addPhoto(image.currentSrc || image.src || attr(el, 'src'));
          addPhoto(attr(el, 'data-src'));
          const srcset = attr(el, 'srcset');
          if (srcset) srcset.split(',').forEach((part) => addPhoto(part.trim().split(/\s+/)[0]));
        });
      } catch {}
    }

    // Collect social profile links only when they are actual links rendered in the Maps sheet.
    const socialHosts = /(^|\.)(instagram\.com|facebook\.com|fb\.com|tiktok\.com|youtube\.com|youtu\.be|linkedin\.com|x\.com|twitter\.com|pinterest\.com|threads\.net|wa\.me|whatsapp\.com)$/i;
    const socialUrls: string[] = [];
    const seenSocial = new Set<string>();
    document.querySelectorAll('a[href]').forEach((anchor) => {
      const href = attr(anchor, 'href');
      try {
        const url = new URL(href, window.location.href);
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        if (socialHosts.test(host) && !seenSocial.has(url.href)) {
          seenSocial.add(url.href);
          socialUrls.push(url.href);
        }
      } catch {}
    });

    const videoUrls: string[] = [];
    const seenVideos = new Set<string>();
    for (const selector of selectors.videos) {
      try {
        document.querySelectorAll(selector).forEach((el) => {
          const media = el as HTMLVideoElement;
          const src = media.currentSrc || media.src || attr(el, 'src') || attr(el, 'href') || attr(el, 'data-video-url');
          if (src.startsWith('http') && !src.includes('cleardot.gif') && !seenVideos.has(src)) {
            seenVideos.add(src); videoUrls.push(src);
          }
        });
      } catch {}
    }

    // Do not mislabel the first gallery photo as a logo/avatar.
    let logo_url = '';
    for (const selector of selectors.logo) {
      try {
        const el = document.querySelector(selector) as HTMLImageElement | null;
        const src = el?.currentSrc || el?.src || '';
        if (src.startsWith('http') && !src.includes('cleardot.gif') &&
            /logo|avatar|profile|perfil/i.test((el?.alt || '') + ' ' + (el?.getAttribute('aria-label') || ''))) {
          logo_url = src; break;
        }
      } catch {}
    }

    return {
      name, category, rating, review_count, price_range, address, website, phone,
      opening_hours, business_status: statusText, description, services_attributes,
      photos: photoUrls.join(' | '), videos: videoUrls.join(' | '), logo_url, social_links: socialUrls.join(' | '),
      currentUrl: window.location.href,
    };
  }, SELECTORS.place);

  const finalUrl = raw.currentUrl || targetUrl;
  const coords = extractCoordinates(finalUrl);
  return {
    id: `place_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    job_id: jobId,
    name: cleanText(raw.name),
    category: normalizeCategory(raw.category),
    address: normalizeAddress(raw.address),
    phone: normalizePhone(raw.phone),
    website: normalizeWebsite(raw.website),
    rating: normalizeRating(raw.rating),
    review_count: normalizeReviewCount(raw.review_count),
    price_range: normalizePriceRange(raw.price_range),
    opening_hours: cleanText(raw.opening_hours),
    business_status: normalizeBusinessStatus(raw.business_status),
    latitude: coords.latitude,
    longitude: coords.longitude,
    maps_url: finalUrl,
    description: cleanText(raw.description),
    services_attributes: cleanText(raw.services_attributes),
    photos: cleanText(raw.photos),
    videos: cleanText(raw.videos),
    logo_url: cleanText(raw.logo_url),
    social_links: cleanText(raw.social_links),
    collected_at: new Date().toISOString(),
  };
}
