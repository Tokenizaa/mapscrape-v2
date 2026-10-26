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
import { SELECTORS } from './selectors';

/**
 * Extracts the 16 tracked fields from a Google Maps place page.
 * Uses structured DOM inspection and robust fallbacks.
 * If a field is missing, leaves it empty without halting.
 */
export async function extractPlaceDetails(
  page: Page,
  jobId: string,
  targetUrl: string
): Promise<PlaceRecord> {
  // Extract raw details inside the browser context
  const raw: any = await page.evaluate((selectors) => {
    if (typeof (window as any).__name === 'undefined') {
      (window as any).__name = function(f: any) { return f; };
    }
    if (typeof (globalThis as any).__name === 'undefined') {
      (globalThis as any).__name = function(f: any) { return f; };
    }

    function getTextBySelectors(selectors: string[]) {
      for (var i = 0; i < selectors.length; i++) {
        try {
          var el = document.querySelector(selectors[i]) as HTMLElement | null;
          if (el && el.innerText && el.innerText.trim()) {
            return el.innerText.trim();
          }
        } catch(e) {}
      }
      return '';
    }

    function getAttrBySelectors(selectors: string[], attr: string) {
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
    var name = getTextBySelectors(selectors.title);

    // 2. Category
    var category = getTextBySelectors(selectors.category);

    // 3. Rating & Review Count
    var rating = getTextBySelectors(selectors.rating);
    if (!rating) rating = getAttrBySelectors(selectors.rating, 'aria-label');

    var review_count = getTextBySelectors(selectors.reviews);
    if (!review_count) review_count = getAttrBySelectors(selectors.reviews, 'aria-label');
    if (review_count === rating) review_count = '';

    // 4. Price range
    var price_range = getAttrBySelectors(selectors.priceRange, 'aria-label') ||
      getTextBySelectors(selectors.priceRange);

    // 5. Address
    var address = getAttrBySelectors(selectors.address, 'aria-label') ||
      getTextBySelectors(selectors.address);

    // 6. Website
    var website = getAttrBySelectors(selectors.website, 'href') ||
      getAttrBySelectors(selectors.website, 'aria-label') ||
      getTextBySelectors(selectors.website);

    // 7. Phone
    var phone = getAttrBySelectors(selectors.phone, 'aria-label') ||
      getTextBySelectors(selectors.phone);

    // 8. Hours and Business status
    var business_status = '';
    var opening_hours = '';

    business_status = getTextBySelectors(selectors.businessStatus) ||
      getAttrBySelectors(selectors.businessStatus, 'aria-label');

    opening_hours = getAttrBySelectors(selectors.hours, 'aria-label') ||
      getTextBySelectors(selectors.hours);

    // 9. Description
    var description = getTextBySelectors(selectors.description);

    // 10. Services & Attributes
    var serviceEls = Array.from(document.querySelectorAll(selectors.services.join(', ')));
    var services_attributes = serviceEls
      .map(function(el) { return (el as HTMLElement).innerText.trim(); })
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
  }, SELECTORS.place);

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
