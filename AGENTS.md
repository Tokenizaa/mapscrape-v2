# MapScrape v2 — instruções para agentes

Serviço central de raspagem do Google Maps com API REST autenticada. Frontend React + Vite + Tailwind; backend Express (dev local) e funções serverless em `api/` (Vercel); banco Supabase; scraper Puppeteer.

## Comandos (npm, Node 24)

package-lock.json é o lockfile canônico do CI (bun.lock existe mas não é usado).

| Comando | O que faz |
|---|---|
| `npm run dev` | `tsx server.ts` — Express + `/api/health` na porta 3000 |
| `npm run build` | `vite build` + `esbuild` empacota `server.ts` → `server.bundle.mjs` |
| `npm start` | `node --import tsx server.ts` |
| `npm test` | `vitest run --fileParallelism=false` |
| `npm run lint` | `tsc --noEmit` (este **é** o typecheck/lint; não há ESLint) |
| `npm run clean` | remove `dist/`, `server.bundle.mjs`, `server.js` |

Ordem do CI (`.github/workflows/ci.yml`): `build → lint → test → npm audit`. Recomendado antes de commitar: `lint -> build -> test`.

## Testes

- `npm test` roda `tests/*.test.ts` com vitest (sem arquivo de config próprio).
- Os testes gravam num **banco Supabase real** (não são mockados). Requer `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` definidos; caso contrário `initDb()`/queries falham.
- Linhas de teste usam IDs únicos (`Date.now()`) para evitar colisão; não há limpeza automática do banco após os testes.
- Não execute coletas reais de Puppeteer nem escritas remotas sem autorização.

## Variáveis de ambiente obrigatórias

- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — acesso ao banco (server-side only).
- `SUPABASE_ANON_KEY` — validação de sessões de usuário (`authenticateRequest`).
- `MAPSCRAPE_PROVISIONING_TOKEN` — emissão de credenciais de API (admin).
- `MAPSCRAPE_SESSION_SECRET`, `MAPSCRAPE_ADMIN_EMAIL`, `MAPSCRAPE_ADMIN_SETUP_TOKEN` — produção Vercel / bootstrap da primeira conta.
- `APP_URL` — URL-base do serviço implantado.

`.env*` é ignorado pelo git (exceto `.env.example`). Nunca commite `.env`, `.env.local` (contém token OIDC da Vercel) ou segredos. Copie de `.env.example` para desenvolvimento local.

## Arquitetura e pontos de entrada

- `api/` — funções serverless da Vercel. Cada arquivo em `api/v1/*` é um endpoint: `health`, `projects`, `jobs`, `leads`, `categories`, `provisioning/credentials`, `auth/{login,register,me}`. `api/_lib.ts` é o cliente Supabase compartilhado.
- `src/server/` — backend Express usado localmente (`server.ts`, porta 3000) e reutilizado pelas funções: `db.ts` (Supabase), `auth.ts` (auth v1), `scraper/` (Puppeteer), `audit-log.ts`, `run-report.ts`, `browserless-endpoint.ts`.
- `src/` — frontend React + Vite (`App.tsx`, `main.tsx`, `components/`).
- Alias TypeScript: `@/*` → raiz do projeto (use em `api/` e `src/`).

Autenticação v1: `Authorization: Bearer <MAPSCRAPE_API_KEY>` (chave hasheada SHA-256 em `api_credentials`, escopo `consumer_project`) OU `Bearer <Supabase session JWT>` (usuário web). Sem token = 401.

## Implantação

Dois alvos configurados — verifique qual está ativo antes de deploy:

- **Vercel**: `vercel.json` (`buildCommand: npm run build`), funções em `api/`. Deploy via Git Integration ou `vercel deploy`. Variáveis de ambiente no painel Vercel geram novo deployment automático.
- **Cloudflare Workers**: `wrangler.jsonc` (worker `mapscrape`), entrada `server.bundle.mjs`. `npm run preview` = `bun run build && wrangler dev`; `npm run deploy` = `bun run build && wrangler deploy`.

`npm run build` gera `dist/` e `server.bundle.mjs` (ambos gitignored). Não commite artefatos de build.

## Banco de dados

Supabase. Esquema via migrações versionadas em `supabase/migrations/` (aplique no SQL Editor do Supabase antes de testes ou de usar o servidor): `20261028_create_users_and_admin.sql`, `20261029010000_repair_dashboard_schema.sql`. Tabelas: `users`, `api_credentials`, `searches` (jobs), `places`, `projects`, `search_categories`, `run_reports`.

## Raspagem (Puppeteer)

`src/server/scraper/` (`runner.ts`, `extractor.ts`, `selectors.ts`, `normalizer.ts`, `csv.ts`). CI define `PUPPETEER_SKIP_DOWNLOAD=true`. O health check (`/api/v1/health`) só valida o banco; não comprova que o navegador de raspagem está operacional.

## CI

`.github/workflows/ci.yml`: `npm ci` → `npm run build` → `npm run lint` → `npm test` → `npm audit --audit-level=high` (Node 24, push/PR em `main`). `.github/workflows/sync-lockfile.yml` regenera `package-lock.json` a partir de `package.json`.
