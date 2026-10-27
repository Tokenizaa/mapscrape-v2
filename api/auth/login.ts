import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../../server.bundle.mjs';

let appPromise: ReturnType<typeof createApp> | undefined;

/**
 * Explicit Vercel route for account login.
 * Keep Express as the source of truth for validation, rate limiting and auth.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    appPromise ??= createApp();
    const app = await appPromise;
    app(req, res);
  } catch (error) {
    appPromise = undefined;
    const message = error instanceof Error ? error.message : 'Falha ao inicializar a API.';
    console.error('Login API initialization failed:', message);
    res.status(503).json({
      error: 'API de autenticação indisponível.',
      detail: message,
    });
  }
}
