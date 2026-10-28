import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../../../server.bundle.mjs';

let appPromise: ReturnType<typeof createApp> | undefined;

/**
 * Explicit Vercel function for the credential collection endpoint.
 * Keep Express as the single source of route/auth behavior; this file only
 * ensures Vercel registers the exact /api/v1/provisioning/credentials path.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    appPromise ??= createApp();
    const app = await appPromise;
    app(req, res);
  } catch (error) {
    appPromise = undefined;
    const message = error instanceof Error ? error.message : 'Falha ao inicializar a API.';
    console.error('Credential provisioning API initialization failed:', message);
    res.status(503).json({
      error: 'API de provisionamento indisponível.',
      detail: message,
    });
  }
}
