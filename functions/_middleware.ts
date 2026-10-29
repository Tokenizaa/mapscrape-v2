import type { PagesFunction } from '@cloudflare/workers-types';

/**
 * Middleware global de Pages Functions.
 * Adiciona headers CORS e content-type JSON para todas as rotas da API.
 */
export const onRequest: PagesFunction = async (context) => {
  const { request } = context;
  const url = new URL(request.url);

  // Aplica apenas a rotas da API
  if (!url.pathname.startsWith('/api/')) {
    return await context.next();
  }

  // Preflight CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-MapScrape-Provisioning-Token',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const response = await context.next();

  // Garante headers CORS na resposta
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-MapScrape-Provisioning-Token');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
