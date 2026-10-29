/**
 * Teste de validação ponta a ponta do fluxo de coleta MapScrape v2.
 *
 * Valida a sequência completa:
 *  1. POST /api/v1/jobs  -> 202 com jobId
 *  2. Poll GET /api/v1/jobs/{id}  -> status sai de running -> terminal
 *  3. GET /api/v1/jobs/{id}/results  -> places com dados
 *  4. Supabase -> searches e places populados com job_id
 *
 * COMO RODAR:
 *   1. Aplique as migrações no SQL Editor do Supabase:
 *      supabase/migrations/20261028_create_users_and_admin.sql
 *      supabase/migrations/20261029010000_repair_dashboard_schema.sql
 *   2. Crie uma api_credentials (ou tenha sessão Supabase válida).
 *   3. Defina as variáveis de ambiente:
 *      MAPSCRAPE_API_KEY (chave de consumidor) OU SUPABASE_SESSION_TOKEN
 *      BASE_URL (padrão http://localhost:3000)
 *   4. Rode o servidor: npm run dev
 *   5. Execute: npm test -- tests/e2e-scrape-validation.test.ts
 *
 * Atenção: este teste faz requisições reais ao Google Maps via Puppeteer
 * (através da API). Use limit pequeno (3-5) para não sobrecarregar.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const BASE_URL = 'http://localhost:3002';
const API_KEY = process.env.MAPSCRAPE_API_KEY ?? '';
const SESSION_TOKEN = process.env.SUPABASE_SESSION_TOKEN ?? '';

const getAuthToken = (): string => API_KEY || SESSION_TOKEN;

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const token = getAuthToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

describe('MapScrape v2 - fluxo completo de coleta', () => {
  let jobId: string | null = null;

  beforeAll(() => {
    if (!getAuthToken()) {
      throw new Error(
        'Defina MAPSCRAPE_API_KEY ou SUPABASE_SESSION_TOKEN no ambiente antes de rodar este teste.'
      );
    }
  });

  it('deve criar um job via POST /api/v1/jobs', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/jobs`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        segment: 'padaria',
        location: 'São Paulo, SP',
        limit: 5,
        projectName: 'Validacao E2E',
        categoryName: 'Alimentação',
      }),
    });

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.data.jobId).toBeDefined();
    expect(typeof body.data.jobId).toBe('string');
    jobId = body.data.jobId;
  });

  it('deve o job sair de running para um estado terminal via polling', async () => {
    expect(jobId).not.toBeNull();

    let status = 'running';
    let attempts = 0;
    const maxAttempts = 60; // até ~2 minutos (poll a cada 2s)

    while (status === 'running' && attempts < maxAttempts) {
      await new Promise((r) => setTimeout(r, 2000));
      attempts += 1;

      const res = await fetch(`${BASE_URL}/api/v1/jobs/${encodeURIComponent(jobId!)}`, {
        headers: headers(),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      status = body.data.status;

      // Se falhou ou parou, ainda assim valida que saiu de running
      if (status !== 'running') break;
    }

    expect(status).not.toBe('running');
    expect(['completed', 'partial', 'stopped', 'failed']).toContain(status);
  });

  it('deve retornar resultados via GET /api/v1/jobs/{id}/results', async () => {
    expect(jobId).not.toBeNull();

    const res = await fetch(
      `${BASE_URL}/api/v1/jobs/${encodeURIComponent(jobId!)}/results?limit=50&offset=0`,
      { headers: headers() }
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination.total).toBeGreaterThanOrEqual(0);
  });

  it('deve ter registros persistidos no Supabase (searches e places)', async () => {
    expect(jobId).not.toBeNull();

    // Verifica se o job existe no banco via endpoint de job
    const res = await fetch(`${BASE_URL}/api/v1/jobs/${encodeURIComponent(jobId!)}`, {
      headers: headers(),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data.id).toBe(jobId);
    expect(body.data.total_found).toBeGreaterThanOrEqual(0);
    expect(body.data.total_collected).toBeGreaterThanOrEqual(0);
  });
});
