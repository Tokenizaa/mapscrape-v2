---
name: mapscrape-api-integration
description: Integrate a software project with the central MapScrape REST API using the actual v1 contract, typed fields, authentication, pagination, and asynchronous jobs.
---

# MapScrape API Integration Skill


## Native platform access versus external integration

For ordinary use of the MapScrape website, direct the operator to the account registration/login page. The native UI uses an individual account session and does not require a consumer API key. Public registration creates a regular user account only; administrator privileges are provisioned server-side. Do not ask the operator to create or paste an API key merely to use MapScrape itself.

This skill is for a separate application consuming MapScrape over HTTPS. That external application requires its own `MAPSCRAPE_API_KEY` in a backend secret manager. Credential issuance in the MapScrape UI is available only after an administrator signs in; never expose or request `MAPSCRAPE_PROVISIONING_TOKEN`.

## Canonical sources
- Portal: https://mapscrape-v2.vercel.app/docs/
- OpenAPI 3.1: https://mapscrape-v2.vercel.app/openapi.yaml
- Full contract: https://github.com/Tokenizaa/mapscrape-v2/blob/main/docs/API.md
- Project/category details: https://github.com/Tokenizaa/mapscrape-v2/blob/main/docs/PROJECTS-CATEGORIES-API.md

## Two distinct usage modes
The MapScrape web application is the product used by its operator to create projects, choose categories, run searches and view results. That normal first-party workflow must not ask the operator to create or paste a consumer API key. Consumer API keys are only for separate third-party systems integrating with MapScrape.

## Architecture and secrets
MapScrape is the central scraper and persistence service. Integrate exclusively over HTTP/HTTPS. Never clone it into the consumer project, copy scraper code, install Puppeteer for this integration, create a parallel scraper, or access the central database directly.

Configure MAPSCRAPE_API_BASE_URL and individual MAPSCRAPE_API_KEY as server-side secrets. Never expose them in browser bundles, URLs, logs, prompts or version control. MAPSCRAPE_PROVISIONING_TOKEN is an administrative bootstrap secret; never supply it to a consumer agent or call provisioning routes from a browser. If no consumer key exists for the external integration, the operator creates one in MapScrape > Integrações > Credenciais de API by entering the client name and consuming project name, then copies the generated key once into the consumer system's server-side secret manager. Do not ask for the provisioning token or ask the user to paste secrets in chat. The first-party MapScrape UI must never require this consumer key to run its own native workflows.

## Actual consumer API
- GET /api/v1/health (public; checks service/database only)
- GET/POST /api/v1/projects
- GET/POST /api/v1/categories
- GET /api/v1/leads?query=&jobId=&sortBy=&sortOrder=&limit=&offset=
- GET /api/v1/leads/{id}
- POST /api/v1/jobs
- GET /api/v1/jobs/{id}
- GET /api/v1/jobs/{id}/results?limit=&offset=

All consumer routes except health require Authorization: Bearer <MAPSCRAPE_API_KEY>. Responses are JSON. Keep the consumer's credentials server-side.

## Lead schema
id, job_id, name, category, address, phone, website, rating, review_count, price_range, opening_hours, business_status, latitude, longitude, maps_url, description, services_attributes, photos, videos, logo_url, booking_url, social_links, reviews, review_topics, additional_attributes, media_items, plus_code, collected_at.
Scalar fields, including rating/review_count/coordinates, are currently strings. photos/videos/social_links are arrays; other structured fields may be objects/arrays or strings when legacy/invalid JSON is preserved. Empty values are missing persisted data, not proof the business lacks the attribute. Preserve unknown values and avoid lossy casts.

## Job lifecycle
POST /api/v1/jobs with required non-empty segment and location, optional integer limit 1..100 (default 20), optional projectName/categoryName. Store data.jobId from 202 response, resolve relative statusUrl/resultsUrl against the configured base, poll GET /api/v1/jobs/{id}, stop at completed/partial/stopped/failed, then fetch results with limit 1..100 and offset >=0. A 202 is not proof the scrape completed. No Idempotency-Key exists; never retry a timed-out job-creation POST blindly.

## Implementation steps
1. Inspect existing architecture, runtime, authentication, UI, tests and conventions.
2. Read current portal/OpenAPI/full contract. Do not invent routes, fields or guarantees.
3. Build a reusable typed server-side HTTP client with timeout, normalized errors and limited retry/backoff for safe reads.
4. Handle GET /api/v1/projects and GET /api/v1/categories when the UI needs explicit selection. POST by name resolves/reuses a normalized name within the consumer scope.
5. Use pagination.hasMore; preserve field values and structured data.
6. Implement loading, empty, auth-error, server-error, running, partial, failed and terminal UI states without duplicate pages.
7. Add tests for auth, schema normalization, pagination, job polling and failures. Use fixtures for tests; never seed fake production records.
8. Run tests, lint/typecheck and build. Clearly separate mocked checks from real API checks.
9. Only perform real production jobs, remote writes, deployment or credential changes when explicitly authorized. Health and HTTP 202 do not prove end-to-end scraping.

## Provisioning endpoints (infrastructure only)
- POST/GET /api/v1/provisioning/credentials
- DELETE /api/v1/provisioning/credentials/{id}
- POST /api/v1/provisioning/credentials/{id}/rotate
Credential provisioning requires an authenticated MapScrape administrator session or the server-side bootstrap header. Issued apiKey is shown once. Rotation revokes the old key before issuing the new one.

## Final report
List changed files, exact test commands/results, and separate mocked tests from authorized live API verification. State blockers plainly.