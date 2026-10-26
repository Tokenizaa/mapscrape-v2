import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../../server.bundle.mjs';

let appPromise: ReturnType<typeof createApp> | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'Método não permitido. Use POST.' });
      return;
    }

    appPromise ??= createApp();
    const app = await appPromise;
    app(req, res);
  } catch (error) {
    appPromise = undefined;
    const message = error instanceof Error ? error.message : 'Falha ao inicializar a API.';
    console.error('Scrape start API initialization failed:', message);
    res.status(503).json({
      error: 'API de raspagem indisponível.',
      detail: message,
    });
  }
}
