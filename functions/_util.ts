/**
 * Utilitários para adaptação de handlers Express (req/res) para
 * Pages Functions (Request/Response) do Cloudflare.
 */

/** Extrai parâmetros de query da URL do request. */
export function getQuery(url: string): Record<string, string> {
  const params = new URL(url).searchParams;
  const out: Record<string, string> = {};
  params.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

/** Extrai parâmetros de rota (ex: [id]) do contexto de Pages Functions. */
export function getParams(context: { params?: Record<string, string | string[]> }): Record<string, string> {
  const out: Record<string, string> = {};
  if (!context.params) return out;
  for (const [key, value] of Object.entries(context.params)) {
    out[key] = Array.isArray(value) ? value[0] : value;
  }
  return out;
}

/** Lê o body JSON do request. Retorna null se não houver body ou não for JSON. */
export async function getBody(request: Request): Promise<any> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** Converte um objeto para Response JSON. */
export function json(data: any, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

/** Converte um texto para Response. */
export function text(body: string, status = 200, contentType = 'text/plain; charset=utf-8'): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': contentType },
  });
}

/** Extrai o header Authorization do request. */
export function getAuthHeader(request: Request): string | undefined {
  return request.headers.get('authorization') || undefined;
}

/** Extrai o header X-MapScrape-Provisioning-Token. */
export function getProvisioningToken(request: Request): string | undefined {
  return request.headers.get('x-mapscrape-provisioning-token') || undefined;
}
