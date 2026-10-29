import type { PagesFunction } from '@cloudflare/workers-types';
import { configureDatabaseEnv } from '../src/server/db';

export const onRequest: PagesFunction = async (context) => {
  // Pages bindings live on context.env, not reliably on process.env in Workers.
  configureDatabaseEnv(context.env as Record<string, unknown>);
  const { request } = context;
  const url = new URL(request.url);

  if (!url.pathname.startsWith('/api/')) {
    return await context.next();
  }

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

  try {
    const response = await context.next();

    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-MapScrape-Provisioning-Token');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'middleware_error', message: error?.message ?? 'Erro no middleware' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
};
