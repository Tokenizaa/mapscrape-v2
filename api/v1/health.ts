import { countPlaces } from '@/src/server/db';

/**
 * GET /api/v1/health — público
 * Verifica serviço e banco. Não verifica conectividade do navegador de raspagem.
 */
export default async function handler(_req: any, res: any): Promise<void> {
  if (_req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Método não permitido.', message: 'Use GET.' });
    return;
  }

  try {
    const totalPlaces = await countPlaces();
    res.status(200).json({
      status: 'ok',
      service: 'mapscrape-api',
      apiVersion: 'v1',
      database: 'connected',
      totalLeads: totalPlaces,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'degraded',
      service: 'mapscrape-api',
      apiVersion: 'v1',
      database: 'unavailable',
      timestamp: new Date().toISOString(),
    });
  }
}
