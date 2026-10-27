import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../../../../server.bundle.mjs';

let appPromise: ReturnType<typeof createApp> | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    appPromise ??= createApp();
    const app = await appPromise;
    app(req, res);
  } catch (error) {
    appPromise = undefined;
    const message = error instanceof Error ? error.message : 'Falha ao inicializar a API.';
    console.error('Credential API initialization failed:', message);
    res.status(503).json({ error: 'API indisponível: configuração de produção incompleta.', detail: message });
  }
}
