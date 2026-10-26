import { createClient, Client } from '@libsql/client';
import path from 'path';
import fs from 'fs';
import { PlaceRecord, ScrapeJob } from '../shared/types';

let dbClient: Client | null = null;

export function getDb(): Client {
  if (!dbClient) {
    const dbPath = path.resolve(process.cwd(), 'mapscrape.db');
    dbClient = createClient({
      url: `file:${dbPath}`,
    });
  }
  return dbClient;
}

export async function initDb(): Promise<void> {
  const db = getDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS searches (
      id TEXT PRIMARY KEY,
      segment TEXT NOT NULL,
      location TEXT NOT NULL,
      limit_requested INTEGER NOT NULL,
      status TEXT NOT NULL,
      status_message TEXT NOT NULL DEFAULT '',
      total_found INTEGER NOT NULL DEFAULT 0,
      total_collected INTEGER NOT NULL DEFAULT 0,
      total_duplicates INTEGER NOT NULL DEFAULT 0,
      total_errors INTEGER NOT NULL DEFAULT 0,
      current_step TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS places (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      website TEXT NOT NULL DEFAULT '',
      rating TEXT NOT NULL DEFAULT '',
      review_count TEXT NOT NULL DEFAULT '',
      price_range TEXT NOT NULL DEFAULT '',
      opening_hours TEXT NOT NULL DEFAULT '',
      business_status TEXT NOT NULL DEFAULT '',
      latitude TEXT NOT NULL DEFAULT '',
      longitude TEXT NOT NULL DEFAULT '',
      maps_url TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      services_attributes TEXT NOT NULL DEFAULT '',
      photos TEXT DEFAULT '',
      videos TEXT DEFAULT '',
      logo_url TEXT DEFAULT '',
      collected_at TEXT NOT NULL,
      FOREIGN KEY (job_id) REFERENCES searches (id) ON DELETE CASCADE
    );
  `);

  try {
    await db.execute(`ALTER TABLE places ADD COLUMN photos TEXT DEFAULT '';`);
  } catch {}
  try {
    await db.execute(`ALTER TABLE places ADD COLUMN videos TEXT DEFAULT '';`);
  } catch {}
  try {
    await db.execute(`ALTER TABLE places ADD COLUMN logo_url TEXT DEFAULT '';`);
  } catch {}

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_places_job_id ON places (job_id);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_places_maps_url ON places (maps_url);`);
}

export async function createJob(job: ScrapeJob): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO searches (
      id, segment, location, limit_requested, status, status_message,
      total_found, total_collected, total_duplicates, total_errors,
      current_step, created_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      job.id,
      job.segment,
      job.location,
      job.limit_requested,
      job.status,
      job.status_message,
      job.total_found,
      job.total_collected,
      job.total_duplicates,
      job.total_errors,
      job.current_step || '',
      job.created_at,
      job.completed_at || null,
    ],
  });
}

export async function updateJobProgress(id: string, updates: Partial<ScrapeJob>): Promise<void> {
  const db = getDb();
  const fields: string[] = [];
  const args: any[] = [];

  for (const [key, val] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    args.push(val);
  }

  if (fields.length === 0) return;

  args.push(id);
  await db.execute({
    sql: `UPDATE searches SET ${fields.join(', ')} WHERE id = ?`,
    args,
  });
}

export async function getJob(id: string): Promise<ScrapeJob | null> {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT * FROM searches WHERE id = ?`,
    args: [id],
  });
  if (res.rows.length === 0) return null;
  return res.rows[0] as unknown as ScrapeJob;
}

export async function listJobs(): Promise<ScrapeJob[]> {
  const db = getDb();
  const res = await db.execute(`SELECT * FROM searches ORDER BY created_at DESC`);
  return res.rows as unknown as ScrapeJob[];
}

export async function deleteJob(id: string): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `DELETE FROM places WHERE job_id = ?`,
    args: [id],
  });
  await db.execute({
    sql: `DELETE FROM searches WHERE id = ?`,
    args: [id],
  });
}

export async function insertPlace(place: PlaceRecord): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `INSERT OR REPLACE INTO places (
      id, job_id, name, category, address, phone, website,
      rating, review_count, price_range, opening_hours, business_status,
      latitude, longitude, maps_url, description, services_attributes,
      photos, videos, logo_url, collected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      place.id,
      place.job_id,
      place.name,
      place.category,
      place.address,
      place.phone,
      place.website,
      place.rating,
      place.review_count,
      place.price_range,
      place.opening_hours,
      place.business_status,
      place.latitude,
      place.longitude,
      place.maps_url,
      place.description,
      place.services_attributes,
      place.photos || '',
      place.videos || '',
      place.logo_url || '',
      place.collected_at,
    ],
  });
}

export async function findPlaceByUrl(url: string): Promise<PlaceRecord | null> {
  if (!url || !url.trim()) return null;
  const db = getDb();
  const cleanUrl = url.trim().split('?')[0].replace(/\/$/, '');
  if (!cleanUrl) return null;
  const res = await db.execute({
    sql: `SELECT * FROM places WHERE rtrim(substr(maps_url, 1, instr(maps_url || '?', '?') - 1), '/') = ? LIMIT 1`,
    args: [cleanUrl],
  });
  return res.rows.length ? res.rows[0] as unknown as PlaceRecord : null;
}

export async function placeExistsByUrl(url: string, _jobId?: string): Promise<boolean> {
  return (await findPlaceByUrl(url)) !== null;
}

export async function getPlaces(options: {
  jobId?: string;
  query?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
}): Promise<{ places: PlaceRecord[]; total: number }> {
  const db = getDb();
  const whereClauses: string[] = [];
  const args: any[] = [];

  if (options.jobId) {
    whereClauses.push(`job_id = ?`);
    args.push(options.jobId);
  }

  if (options.query && options.query.trim()) {
    const q = `%${options.query.trim()}%`;
    whereClauses.push(`(name LIKE ? OR category LIKE ? OR address LIKE ? OR phone LIKE ? OR website LIKE ?)`);
    args.push(q, q, q, q, q);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Get count
  const countRes = await db.execute({
    sql: `SELECT COUNT(*) as count FROM places ${whereSql}`,
    args,
  });
  const total = Number(countRes.rows[0]?.count || 0);

  // Sorting
  const allowedSortCols = ['name', 'category', 'rating', 'review_count', 'collected_at'];
  const sortBy = allowedSortCols.includes(options.sortBy || '') ? options.sortBy : 'collected_at';
  const sortOrder = options.sortOrder === 'asc' ? 'ASC' : 'DESC';

  const limit = options.limit || 50;
  const offset = options.offset || 0;

  const dataArgs = [...args, limit, offset];
  const dataRes = await db.execute({
    sql: `SELECT * FROM places ${whereSql} ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`,
    args: dataArgs,
  });

  return {
    places: dataRes.rows as unknown as PlaceRecord[],
    total,
  };
}

export async function getPlacesByIds(ids: string[]): Promise<PlaceRecord[]> {
  if (ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  const res = await db.execute({
    sql: `SELECT * FROM places WHERE id IN (${placeholders}) ORDER BY collected_at DESC`,
    args: ids,
  });
  return res.rows as unknown as PlaceRecord[];
}

export async function getAllPlaces(jobId?: string): Promise<PlaceRecord[]> {
  const db = getDb();
  if (jobId) {
    const res = await db.execute({
      sql: `SELECT * FROM places WHERE job_id = ? ORDER BY collected_at DESC`,
      args: [jobId],
    });
    return res.rows as unknown as PlaceRecord[];
  }
  const res = await db.execute(`SELECT * FROM places ORDER BY collected_at DESC`);
  return res.rows as unknown as PlaceRecord[];
}

export async function countPlaces(): Promise<number> {
  const db = getDb();
  const result = await db.execute('SELECT COUNT(*) AS count FROM places');
  return Number(result.rows[0]?.count ?? 0);
}


/** Latest saved Maps URL for the exact same search, used as a resume checkpoint. */
export async function getLastCollectedPlaceForSearch(segment: string, location: string): Promise<PlaceRecord | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT p.* FROM places p
          INNER JOIN searches s ON s.id = p.job_id
          WHERE lower(trim(s.segment)) = lower(trim(?))
            AND lower(trim(s.location)) = lower(trim(?))
          ORDER BY p.collected_at DESC
          LIMIT 1`,
    args: [segment, location],
  });
  return result.rows.length ? result.rows[0] as unknown as PlaceRecord : null;
}
