import { countPlaces } from '@/src/server/db';
import { json } from '@/functions/_util';

export const onRequestGet = async (): Promise<Response> => {
  try {
    const totalPlaces = await countPlaces();
    return json({
      status: 'ok',
      service: 'mapscrape-api',
      apiVersion: 'v1',
      database: 'connected',
      totalLeads: totalPlaces,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return json(
      {
        status: 'degraded',
        service: 'mapscrape-api',
        apiVersion: 'v1',
        database: 'unavailable',
        timestamp: new Date().toISOString(),
      },
      503,
    );
  }
};
