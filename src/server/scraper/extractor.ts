import { Page } from 'puppeteer';
import { PlaceRecord } from '../../shared/types';
import {
  cleanText,
  normalizeAddress,
  normalizePhone,
  normalizeWebsite,
  normalizeCategory,
  normalizeRating,
  normalizeReviewCount,
  normalizePriceRange,
  normalizeBusinessStatus,
  extractCoordinates,
} from './normalizer';

/**
 * Extracts the 15 specified fields from a Google Maps place page.
 * Uses structured DOM inspection and robust fallbacks.
 * If a field is missing, leaves it empty without halting.
 */
export async function extractPlaceDetails(
  page: Page,
  jobId: string,
  targetUrl: string
): Promise<PlaceRecord> {
  // Extract raw details inside the browser context
  const raw: any = await page.evaluate(`(() => {
    if (typeof window.__name === 'undefined') {
      window.__name = function(f) { return f; };
    }
    if (typeof globalThis.__name === 'undefined') {
      globalThis.__name = function(f) { return f; };
    }

    function getTextBySelectors(selectors) {
      for (var i = 0; i < selectors.length; i++) {
        try {
          var el = document.querySelector(selectors[i]);
          if (el && el.innerText && el.innerText.trim()) {
            return el.innerText.trim();
          }
        } catch(e) {}
      }
      return '';
    }

    function getAttrBySelectors(selectors, attr) {
      for (var i = 0; i < selectors.length; i++) {
        try {
          var el = document.querySelector(selectors[i]);
          if (el) {
            var val = el.getAttribute(attr);
            if (val && val.trim()) return val.trim();
          }
        } catch(e) {}
      }
      return '';
    }

    // 1. Name
    var name = getTextBySelectors([
      'h1.DUwDvf',
      'h1.fontHeadlineLarge',
      'div[role="main"] h1',
      'h1'
    ]);

    // 2. Category
    var category = getTextBySelectors([
      'button[jsaction*="pane.rating.category"]',
      'button.DkEaL',
      'span.Y0A0hc',
      'button[jsaction*="category"]'
    ]);

    // 3. Rating & Review Count
    var ratingEl = document.querySelector('div.F7nice span[aria-hidden="true"], span.ceNzKf, div.fontDisplayLarge');
    var rating = ratingEl ? ratingEl.innerText.trim() : '';

    var review_count = '';
    var reviewEl = document.querySelector('span[aria-label*="avalia"], span[aria-label*="reviews"], div.F7nice > span:nth-child(2)');
    if (reviewEl) {
      var rText = reviewEl.innerText ? reviewEl.innerText.trim() : (reviewEl.getAttribute('aria-label') || '');
      if (rText && rText !== rating) {
        review_count = rText;
      }
    }

    // 4. Price range
    var price_range = getAttrBySelectors(['span[aria-label*="Preço:"]', 'span[aria-label*="Price:"]'], 'aria-label') ||
      getTextBySelectors(['span.mgr77e', 'span[aria-label*="Preço"]']);

    // 5. Address
    var address = '';
    var addressBtn = document.querySelector('button[data-item-id="address"], [data-item-id="address"]');
    if (addressBtn) {
      address = addressBtn.getAttribute('aria-label') || addressBtn.innerText;
    } else {
      var aEl = document.querySelector('button[aria-label*="Endereço:"]');
      if (aEl) address = aEl.getAttribute('aria-label') || aEl.innerText;
    }

    // 6. Website
    var website = '';
    var websiteEl = document.querySelector('a[data-item-id="authority"], [data-item-id="authority"]');
    if (websiteEl) {
      website = websiteEl.getAttribute('href') || websiteEl.innerText;
    } else {
      var wEl = document.querySelector('a[aria-label*="Website:"], a[aria-label*="Site:"]');
      if (wEl) website = wEl.getAttribute('href') || wEl.innerText;
    }

    // 7. Phone
    var phone = '';
    var phoneBtn = document.querySelector('button[data-item-id^="phone:"], [data-item-id^="phone:"]');
    if (phoneBtn) {
      phone = phoneBtn.getAttribute('aria-label') || phoneBtn.innerText;
    } else {
      var pEl = document.querySelector('button[aria-label*="Telefone:"], button[aria-label*="Phone:"]');
      if (pEl) phone = pEl.getAttribute('aria-label') || pEl.innerText;
    }

    // 8. Hours and Business status
    var business_status = '';
    var opening_hours = '';

    var statusEl = document.querySelector('span.ZDu9vd span:first-child, div.OM3Cfd span:first-child, span.o0Svhf');
    if (statusEl) {
      business_status = statusEl.innerText.trim();
    }

    var hoursContainer = document.querySelector('div[aria-label*="Horário"], div.t39EBf, table.eKjhbv, div.OM3Cfd');
    if (hoursContainer) {
      opening_hours = hoursContainer.getAttribute('aria-label') || hoursContainer.innerText.trim();
    }

    // 9. Description
    var description = getTextBySelectors([
      'div.PYvSYb',
      'div.WeS02d',
      'div.bJzME.Hu9e2e div.loref',
      'div.w70O2e'
    ]);

    // 10. Services & Attributes
    var serviceEls = Array.from(document.querySelectorAll('div.E0dtEd, div.dr4qPd, div.LTs0Rc, div[aria-label*="Serviços"]'));
    var services_attributes = serviceEls
      .map(function(el) { return el.innerText.trim(); })
      .filter(Boolean)
      .join(' · ');

    return {
      name: name,
      category: category,
      address: address,
      phone: phone,
      website: website,
      rating: rating,
      review_count: review_count,
      price_range: price_range,
      opening_hours: opening_hours,
      business_status: business_status,
      description: description,
      services_attributes: services_attributes,
      currentUrl: window.location.href
    };
  })()`);

  const finalUrl = raw.currentUrl || targetUrl;
  const coords = extractCoordinates(finalUrl);

  const now = new Date().toISOString();

  const record: PlaceRecord = {
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
    collected_at: now,
  };

  return record;
}
