/**
 * Utilitários para Cloudflare Pages Functions.
 * O handler recebe um contexto com { request, env, next, params, data, ... }.
 * O Request real está em context.request.
 */

export function getRequest(context: any): Request {
  return context.request;
}

export function getEnv(context: any): Record<string, string | undefined> {
  return context.env || process.env;
}

export function getParams(context: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!context.params) return out;
  for (const [key, value] of Object.entries(context.params)) {
    out[key] = Array.isArray(value) ? value[0] : String(value);
  }
  return out;
}

export function getQuery(url: string): Record<string, string> {
  const params = new URL(url).searchParams;
  const out: Record<string, string> = {};
  params.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

export async function getBodyText(req: Request): Promise<string> {
  return await req.text();
}

export async function getBodyJson(req: Request): Promise<any> {
  const text = await req.text();
  try { return JSON.parse(text); } catch { return {}; }
}

export function json(data: any, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

export function text(body: string, status = 200, contentType = 'text/plain; charset=utf-8'): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': contentType },
  });
}

export function getAuthHeader(req: Request): string | undefined {
  return req.headers.get('authorization') || undefined;
}

export function getProvisioningToken(req: Request): string | undefined {
  return req.headers.get('x-mapscrape-provisioning-token') || undefined;
}
