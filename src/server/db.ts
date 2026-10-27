import { createClient, Client } from '@libsql/client';
import path from 'path';
import fs from 'fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { PlaceRecord, ScrapeJob } from '../shared/types';

let dbClient: Client | null = null;

export function getDb(): Client {
  if (!dbClient) {
    const remoteUrl = process.env.TURSO_DATABASE_URL?.trim();
    const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

    if (process.env.VERCEL && (!remoteUrl || !authToken)) {
      throw new Error('Backend de produção não configurado: defina TURSO_DATABASE_URL e TURSO_AUTH_TOKEN no Vercel.');
    }

    if (remoteUrl && authToken) {
      dbClient = createClient({ url: remoteUrl, authToken });
    } else {
      const dbPath = path.resolve(process.cwd(), 'mapscrape.db');
      dbClient = createClient({ url: `file:${dbPath}` });
    }
  }
  return dbClient;
}

export async function initDb(): Promise<void> {
  const db = getDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS searches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      segment TEXT NOT NULL,
      project_name TEXT NOT NULL DEFAULT '',
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

  try { await db.execute(`ALTER TABLE searches ADD COLUMN project_name TEXT NOT NULL DEFAULT '';`); } catch {}

  // Migrate databases created before per-user ownership was added to searches.
  // Existing searches are kept but are unowned until explicitly reassigned.
  try {
    await db.execute(`ALTER TABLE searches ADD COLUMN user_id TEXT NOT NULL DEFAULT '';`);
  } catch {
    // Column already exists on fresh/current databases.
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS run_reports (
      job_id TEXT PRIMARY KEY,
      report_json TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      FOREIGN KEY (job_id) REFERENCES searches (id) ON DELETE CASCADE
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
      booking_url TEXT DEFAULT '',
      social_links TEXT DEFAULT '',
      reviews TEXT DEFAULT '[]',
      review_topics TEXT DEFAULT '[]',
      additional_attributes TEXT DEFAULT '{}',
      media_items TEXT DEFAULT '[]',
      plus_code TEXT DEFAULT '',
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

  try {
    await db.execute(`ALTER TABLE places ADD COLUMN social_links TEXT DEFAULT '';`);
  } catch {}

  for (const [column, definition] of [
    ['reviews', `TEXT DEFAULT '[]'`],
    ['review_topics', `TEXT DEFAULT '[]'`],
    ['additional_attributes', `TEXT DEFAULT '{}'`],
    ['media_items', `TEXT DEFAULT '[]'`],
    ['plus_code', `TEXT DEFAULT ''`],
  ] as const) {
    try { await db.execute(`ALTER TABLE places ADD COLUMN ${column} ${definition};`); } catch {}
  }

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_places_job_id ON places (job_id);`);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS api_credentials (
      id TEXT PRIMARY KEY,
      consumer_name TEXT NOT NULL,
      consumer_project TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      revoked_at TEXT
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_api_credentials_status ON api_credentials (status);`);
  await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_api_credentials_active_project ON api_credentials (consumer_project) WHERE status = 'active';`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_places_maps_url ON places (maps_url);`);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      consumer_project TEXT NOT NULL,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (consumer_project, normalized_name)
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_projects_scope ON projects (consumer_project, normalized_name);`);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS search_categories (
      id TEXT PRIMARY KEY,
      consumer_project TEXT NOT NULL,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (consumer_project, normalized_name)
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_search_categories_scope ON search_categories (consumer_project, normalized_name);`);
  for (const [column, definition] of [['project_id', "TEXT"], ['category_id', "TEXT"]] as const) {
    try { await db.execute(`ALTER TABLE searches ADD COLUMN ${column} ${definition};`); } catch {}
  }

}

export async function createApiCredential(input: {
  id: string; consumerName: string; consumerProject: string; keyHash: string; createdAt: string;
}): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO api_credentials (id, consumer_name, consumer_project, key_hash, status, created_at)
          VALUES (?, ?, ?, ?, 'active', ?)`,
    args: [input.id, input.consumerName, input.consumerProject, input.keyHash, input.createdAt],
  });
}

export async function findActiveApiCredential(keyHash: string): Promise<{ id: string; consumer_project: string } | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, consumer_project FROM api_credentials WHERE key_hash = ? AND status = 'active' LIMIT 1`,
    args: [keyHash],
  });
  if (!result.rows.length) return null;
  const row = result.rows[0] as unknown as { id: string; consumer_project: string };
  await db.execute({ sql: `UPDATE api_credentials SET last_used_at = ? WHERE id = ?`, args: [new Date().toISOString(), row.id] });
  return row;
}

export async function revokeApiCredential(id: string): Promise<boolean> {
  const db = getDb();
  const result = await db.execute({
    sql: `UPDATE api_credentials SET status = 'revoked', revoked_at = ? WHERE id = ? AND status = 'active'`,
    args: [new Date().toISOString(), id],
  });
  return Number(result.rowsAffected || 0) > 0;
}

export async function listApiCredentials(): Promise<Array<{ id: string; consumer_name: string; consumer_project: string; status: string; created_at: string; last_used_at: string | null; revoked_at: string | null }>> {
  const db = getDb();
  const result = await db.execute(`SELECT id, consumer_name, consumer_project, status, created_at, last_used_at, revoked_at FROM api_credentials ORDER BY created_at DESC`);
  return result.rows as unknown as Array<{ id: string; consumer_name: string; consumer_project: string; status: string; created_at: string; last_used_at: string | null; revoked_at: string | null }>;
}

export async function createJob(job: ScrapeJob & { user_id: string }): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO searches (
      id, user_id, segment, project_name, project_id, category_id, location, limit_requested, status, status_message,
      total_found, total_collected, total_duplicates, total_errors,
      current_step, created_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      job.id,
      job.user_id,
      job.segment,
      job.project_name || `${job.segment} · ${job.location}`,
      job.project_id || null,
      job.category_id || null,
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

export async function getJob(id: string, consumerProject?: string): Promise<ScrapeJob | null> {
  const db = getDb();
  const res = await db.execute({
    sql: consumerProject
      ? `SELECT * FROM searches WHERE id = ? AND user_id = ?`
      : `SELECT * FROM searches WHERE id = ?`,
    args: consumerProject ? [id, consumerProject] : [id],
  });
  if (res.rows.length === 0) return null;
  return res.rows[0] as unknown as ScrapeJob;
}

export async function listJobs(consumerProject?: string): Promise<ScrapeJob[]> {
  const db = getDb();
  const res = await db.execute({
    sql: consumerProject
      ? `SELECT * FROM searches WHERE user_id = ? ORDER BY created_at DESC`
      : `SELECT * FROM searches ORDER BY created_at DESC`,
    args: consumerProject ? [consumerProject] : [],
  });
  return res.rows as unknown as ScrapeJob[];
}

export async function deleteJob(id: string, consumerProject?: string): Promise<boolean> {
  const db = getDb();
  const job = await getJob(id, consumerProject);
  if (!job) return false;
  await db.execute({ sql: `DELETE FROM places WHERE job_id = ?`, args: [id] });
  await db.execute({ sql: `DELETE FROM searches WHERE id = ?`, args: [id] });
  return true;
}

export async function insertPlace(place: PlaceRecord): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `INSERT OR REPLACE INTO places (
      id, job_id, name, category, address, phone, website,
      rating, review_count, price_range, opening_hours, business_status,
      latitude, longitude, maps_url, description, services_attributes,
      photos, videos, logo_url, booking_url, social_links, reviews, review_topics, additional_attributes, media_items, plus_code, collected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      place.booking_url || '',
      place.social_links || '',
      place.reviews || '[]',
      place.review_topics || '[]',
      place.additional_attributes || '{}',
      place.media_items || '[]',
      place.plus_code || '',
      place.collected_at,
    ],
  });
}

/** Update an existing place row in place so a new scrape can enrich old records without duplicating them. */
export async function updatePlace(id: string, place: PlaceRecord): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `UPDATE places SET
      name = ?, category = ?, address = ?, phone = ?, website = ?, rating = ?, review_count = ?,
      price_range = ?, opening_hours = ?, business_status = ?, latitude = ?, longitude = ?, maps_url = ?,
      description = ?, services_attributes = ?, photos = ?, videos = ?, logo_url = ?, booking_url = ?, social_links = ?,
      reviews = ?, review_topics = ?, additional_attributes = ?, media_items = ?, plus_code = ?, collected_at = ?
      WHERE id = ?`,
    args: [
      place.name, place.category, place.address, place.phone, place.website, place.rating, place.review_count,
      place.price_range, place.opening_hours, place.business_status, place.latitude, place.longitude, place.maps_url,
      place.description, place.services_attributes, place.photos || '', place.videos || '', place.logo_url || '',
      place.booking_url || '', place.social_links || '', place.reviews || '[]', place.review_topics || '[]', place.additional_attributes || '{}',
      place.media_items || '[]', place.plus_code || '', place.collected_at, id,
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
  category?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
  consumerProject?: string;
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

  if (options.category && options.category.trim()) {
    whereClauses.push(`lower(trim(category)) = lower(trim(?))`);
    args.push(options.category.trim());
  }

  if (options.consumerProject) {
    whereClauses.push(`EXISTS (SELECT 1 FROM searches s WHERE s.id = places.job_id AND s.user_id = ?)`);
    args.push(options.consumerProject);
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

export async function getPlacesByIds(ids: string[], consumerProject?: string): Promise<PlaceRecord[]> {
  if (ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  const sql = consumerProject
    ? `SELECT places.* FROM places INNER JOIN searches s ON s.id = places.job_id WHERE places.id IN (${placeholders}) AND s.user_id = ? ORDER BY places.collected_at DESC`
    : `SELECT * FROM places WHERE id IN (${placeholders}) ORDER BY collected_at DESC`;
  const res = await db.execute({ sql, args: consumerProject ? [...ids, consumerProject] : ids });
  return res.rows as unknown as PlaceRecord[];
}

export async function getAllPlaces(jobId?: string, consumerProject?: string): Promise<PlaceRecord[]> {
  const db = getDb();
  const where: string[] = [];
  const args: unknown[] = [];
  if (jobId) { where.push('p.job_id = ?'); args.push(jobId); }
  if (consumerProject) { where.push('s.user_id = ?'); args.push(consumerProject); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const res = await db.execute({
    sql: `SELECT p.* FROM places p INNER JOIN searches s ON s.id = p.job_id ${whereSql} ORDER BY p.collected_at DESC`,
    args,
  });
  return res.rows as unknown as PlaceRecord[];
}

export async function listPlaceCategories(): Promise<string[]> {
  const db = getDb();
  const result = await db.execute("SELECT DISTINCT trim(category) AS category FROM places WHERE trim(category) <> '' ORDER BY lower(trim(category)) ASC");
  return result.rows.map((row) => String(row.category || '')).filter(Boolean);
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


/** Persist run evidence in the remote database; serverless filesystems are ephemeral/read-only. */
export async function saveRunReport(jobId: string, reportJson: string, generatedAt: string): Promise<void> {
  const db = getDb();
  const compressed = 'gzip-base64:' + gzipSync(Buffer.from(reportJson, 'utf8')).toString('base64');
  await db.execute({
    sql: `INSERT INTO run_reports (job_id, report_json, generated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(job_id) DO UPDATE SET report_json = excluded.report_json, generated_at = excluded.generated_at`,
    args: [jobId, compressed, generatedAt],
  });
}

export async function getRunReport(jobId: string): Promise<string | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT report_json FROM run_reports WHERE job_id = ? LIMIT 1',
    args: [jobId],
  });
  const row = result.rows[0] as unknown as { report_json?: string } | undefined;
  if (typeof row?.report_json !== 'string') return null;
  if (row.report_json.startsWith('gzip-base64:')) {
    return gunzipSync(Buffer.from(row.report_json.slice('gzip-base64:'.length), 'base64')).toString('utf8');
  }
  // Read legacy uncompressed reports if the schema was populated by an earlier build.
  return row.report_json;
}


export interface ProjectRecord {
  id: string;
  consumer_project: string;
  name: string;
  normalized_name: string;
  created_at: string;
  updated_at: string;
}

export interface SearchCategoryRecord {
  id: string;
  consumer_project: string;
  name: string;
  normalized_name: string;
  created_at: string;
}

function normalizeCatalogName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

export async function listProjects(consumerProject: string): Promise<ProjectRecord[]> {
  const result = await getDb().execute({
    sql: `SELECT * FROM projects WHERE consumer_project = ? ORDER BY name COLLATE NOCASE`,
    args: [consumerProject],
  });
  return result.rows as unknown as ProjectRecord[];
}

export async function resolveProject(consumerProject: string, name: string): Promise<ProjectRecord> {
  const normalized = normalizeCatalogName(name);
  if (!normalized) throw new Error('project_name_required');
  const db = getDb();
  const existing = await db.execute({
    sql: `SELECT * FROM projects WHERE consumer_project = ? AND normalized_name = ? LIMIT 1`,
    args: [consumerProject, normalized],
  });
  if (existing.rows.length) return existing.rows[0] as unknown as ProjectRecord;
  const now = new Date().toISOString();
  const record: ProjectRecord = {
    id: `prj_${crypto.randomUUID().replace(/-/g, '')}`,
    consumer_project: consumerProject,
    name: name.trim().replace(/\\s+/g, ' ').slice(0, 120),
    normalized_name: normalized,
    created_at: now,
    updated_at: now,
  };
  await db.execute({
    sql: `INSERT INTO projects (id, consumer_project, name, normalized_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [record.id, record.consumer_project, record.name, record.normalized_name, record.created_at, record.updated_at],
  });
  return record;
}

export async function listSearchCategories(consumerProject: string): Promise<SearchCategoryRecord[]> {
  const result = await getDb().execute({
    sql: `SELECT * FROM search_categories WHERE consumer_project = ? ORDER BY name COLLATE NOCASE`,
    args: [consumerProject],
  });
  return result.rows as unknown as SearchCategoryRecord[];
}

export async function resolveSearchCategory(consumerProject: string, name: string): Promise<SearchCategoryRecord> {
  const normalized = normalizeCatalogName(name);
  if (!normalized) throw new Error('category_name_required');
  const db = getDb();
  const existing = await db.execute({
    sql: `SELECT * FROM search_categories WHERE consumer_project = ? AND normalized_name = ? LIMIT 1`,
    args: [consumerProject, normalized],
  });
  if (existing.rows.length) return existing.rows[0] as unknown as SearchCategoryRecord;
  const record: SearchCategoryRecord = {
    id: `cat_${crypto.randomUUID().replace(/-/g, '')}`,
    consumer_project: consumerProject,
    name: name.trim().replace(/\\s+/g, ' ').slice(0, 120),
    normalized_name: normalized,
    created_at: new Date().toISOString(),
  };
  await db.execute({
    sql: `INSERT INTO search_categories (id, consumer_project, name, normalized_name, created_at) VALUES (?, ?, ?, ?, ?)`,
    args: [record.id, record.consumer_project, record.name, record.normalized_name, record.created_at],
  });
  return record;
}
