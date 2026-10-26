---
name: mapscrape-api-integration
description: Integrate a software project with the central MapScrape REST API without cloning or installing the scraper.
---

# MapScrape API Integration Skill

## Sources of truth
- Public documentation: https://mapscrape-v2.vercel.app/docs/
- OpenAPI: https://mapscrape-v2.vercel.app/openapi.yaml
- REST contract: https://github.com/Tokenizaa/mapscrape-v2/blob/main/docs/API.md

## Mandatory architecture
MapScrape is the central scraping and persistence service. Consumer projects access it exclusively through HTTP/HTTPS. Never clone this repository into a consumer, copy scraper code, install Puppeteer for this integration, create a parallel scraper, or connect directly to the central database.

## Secrets
Configure only MAPSCRAPE_API_BASE_URL and individual MAPSCRAPE_API_KEY as server-side secrets in the consumer. Never expose them to browser bundles, logs, query strings, prompts, or source control. MAPSCRAPE_PROVISIONING_TOKEN is an administrative bootstrap secret and must never be supplied to a consumer agent. If no individual key exists, stop and ask an authorized operator to provision and store it directly in the consumer secret manager. Do not ask the user to paste the key into chat.

## Implementation
1. Inspect the existing project architecture, language/runtime, authentication, UI, tests and conventions.
2. Read the live documentation and OpenAPI contract; do not invent fields, endpoints, capabilities, or production status.
3. Implement a reusable typed HTTP client with timeout and normalized errors.
4. Use GET /api/v1/leads with limit/offset and pagination.hasMore; GET /api/v1/leads/{id} for details.
5. For collection creation, POST /api/v1/jobs, retain data.jobId, poll GET /api/v1/jobs/{id}, then retrieve GET /api/v1/jobs/{id}/results. Do not block a web request waiting for a job or retry POST blindly.
6. Preserve unknown/structured fields and do not fabricate missing values.
7. Integrate with existing UI without duplicate pages or dashboards.
8. Add tests for authentication, pagination, error handling, job states and UI; use fixtures, never fake production records.
9. Run tests, lint, typecheck and build. Only claim real API/production validation when performed against the deployed API with an authorized credential.
10. Do not deploy, perform bulk scraping, write remote production data, or alter credentials without explicit authorization.

## Required final report
List changed files, commands and actual results; separate mocked tests from real API validation and name external blockers. Do not stop at an audit or plan when implementation was requested.
