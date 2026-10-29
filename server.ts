import 'dotenv/config';
import express from 'express';
import path from 'path';
import { initDb } from './src/server/db';
import { initAuditLog } from './src/server/audit-log';

export async function createApp(): Promise<express.Express> {
  await initDb();
  await initAuditLog();

  const app = express();
  app.use(express.json());

  // Simple health check
  app.get('/api/health', async (_req, res) => {
    try {
      const { countPlaces } = await import('./src/server/db');
      const totalPlaces = await countPlaces();
      res.json({ status: 'ok', database: 'connected', totalPlaces, timestamp: new Date().toISOString() });
    } catch (error) {
      res.status(503).json({ status: 'degraded', database: 'unavailable' });
    }
  });

  // Auth routes - use the api/auth routes from the Express app
  // These are mounted separately

  // Fallback: serve frontend
  if (process.env.NODE_ENV !== 'production') {
    // In development, just log
    console.log('Development mode - API routes handled by api/ directory');
  }

  return app;
}

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  createApp().then((app) => {
    const port = Number(process.env.PORT) || 3000;
    app.listen(port, '0.0.0.0', () => {
      console.log(`MapScrape API server running on http://0.0.0.0:${port}`);
    });
  }).catch((err) => {
    console.error('Server startup error:', err);
    process.exit(1);
  });
}