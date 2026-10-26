import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../../../server.bundle.mjs';

let appPromise: ReturnType<typeof createApp> | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ error: 'Método não permitido. Use GET.' });
      return;
    }
    appPromise ??= createApp();
    const app = await appPromise;
    app(req, res);
  } catch (error) {
    appPromise = undefined;
    const detail = error instanceof Error ? error.message : 'Falha ao inicializar a API.';
    console.error('Scrape status API initialization failed:', detail);
    res.status(503).json({ error: 'API de status da coleta indisponível.', detail });
  }
}
