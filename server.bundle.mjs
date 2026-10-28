var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/server/db.ts
var db_exports = {};
__export(db_exports, {
  countPlaces: () => countPlaces,
  countUsers: () => countUsers,
  createApiCredential: () => createApiCredential,
  createJob: () => createJob,
  createUser: () => createUser,
  deleteJob: () => deleteJob,
  deleteProject: () => deleteProject,
  deleteSearchCategory: () => deleteSearchCategory,
  findActiveApiCredential: () => findActiveApiCredential,
  findPlaceByUrl: () => findPlaceByUrl,
  findUserByEmail: () => findUserByEmail,
  findUserById: () => findUserById,
  getAllPlaces: () => getAllPlaces,
  getDb: () => getDb,
  getJob: () => getJob,
  getLastCollectedPlaceForSearch: () => getLastCollectedPlaceForSearch,
  getPlaces: () => getPlaces,
  getPlacesByIds: () => getPlacesByIds,
  getRunReport: () => getRunReport,
  initDb: () => initDb,
  insertPlace: () => insertPlace,
  listApiCredentials: () => listApiCredentials,
  listJobs: () => listJobs,
  listPlaceCategories: () => listPlaceCategories,
  listProjects: () => listProjects,
  listSearchCategories: () => listSearchCategories,
  placeExistsByUrl: () => placeExistsByUrl,
  resolveProject: () => resolveProject,
  resolveSearchCategory: () => resolveSearchCategory,
  revokeApiCredential: () => revokeApiCredential,
  saveRunReport: () => saveRunReport,
  updateJobProgress: () => updateJobProgress,
  updatePlace: () => updatePlace,
  updateProject: () => updateProject,
  updateSearchCategory: () => updateSearchCategory,
  updateUserLogin: () => updateUserLogin
});
import { createClient } from "@libsql/client";
import path from "path";
import { gzipSync, gunzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
function getDb() {
  if (!dbClient) {
    const remoteUrl = process.env.TURSO_DATABASE_URL?.trim();
    const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
    if (process.env.VERCEL && (!remoteUrl || !authToken)) {
      throw new Error("Backend de produ\xE7\xE3o n\xE3o configurado: defina TURSO_DATABASE_URL e TURSO_AUTH_TOKEN no Vercel.");
    }
    if (remoteUrl && authToken) {
      dbClient = createClient({ url: remoteUrl, authToken });
    } else {
      const dbPath = path.resolve(process.cwd(), "mapscrape.db");
      dbClient = createClient({ url: `file:${dbPath}` });
    }
  }
  return dbClient;
}
function initDb() {
  if (!initPromise) {
    initPromise = (async () => {
      const db = getDb();
      if (!process.env.TURSO_DATABASE_URL) {
        try {
          await db.execute("PRAGMA busy_timeout = 10000;");
          await db.execute("PRAGMA synchronous = NORMAL;");
        } catch {
        }
      }
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
      try {
        await db.execute(`ALTER TABLE searches ADD COLUMN project_name TEXT NOT NULL DEFAULT '';`);
      } catch {
      }
      try {
        await db.execute(`ALTER TABLE searches ADD COLUMN user_id TEXT NOT NULL DEFAULT '';`);
      } catch {
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
      attributes TEXT DEFAULT '[]',
      accessibility_attributes TEXT DEFAULT '[]',
      next_opening_text TEXT DEFAULT '',
      next_open_day TEXT DEFAULT '',
      next_open_time TEXT DEFAULT '',
      visible_photos_count TEXT DEFAULT '',
      postal_code TEXT DEFAULT '',
      country TEXT DEFAULT '',
      city TEXT DEFAULT '',
      state TEXT DEFAULT '',
      source_place_id TEXT DEFAULT '',
      source_url TEXT DEFAULT '',
      popular_times TEXT DEFAULT '{}',
      rating_distribution TEXT DEFAULT '{}',
      review_highlights TEXT DEFAULT '[]',
      field_status TEXT DEFAULT '{}',
      collected_at TEXT NOT NULL,
      FOREIGN KEY (job_id) REFERENCES searches (id) ON DELETE CASCADE
    );
  `);
      try {
        await db.execute(`ALTER TABLE places ADD COLUMN photos TEXT DEFAULT '';`);
      } catch {
      }
      try {
        await db.execute(`ALTER TABLE places ADD COLUMN videos TEXT DEFAULT '';`);
      } catch {
      }
      try {
        await db.execute(`ALTER TABLE places ADD COLUMN logo_url TEXT DEFAULT '';`);
      } catch {
      }
      try {
        await db.execute(`ALTER TABLE places ADD COLUMN booking_url TEXT DEFAULT '';`);
      } catch {
      }
      try {
        await db.execute(`ALTER TABLE places ADD COLUMN social_links TEXT DEFAULT '';`);
      } catch {
      }
      for (const [column, definition] of [
        ["reviews", `TEXT DEFAULT '[]'`],
        ["review_topics", `TEXT DEFAULT '[]'`],
        ["additional_attributes", `TEXT DEFAULT '{}'`],
        ["media_items", `TEXT DEFAULT '[]'`],
        ["plus_code", `TEXT DEFAULT ''`],
        ["attributes", `TEXT DEFAULT '[]'`],
        ["accessibility_attributes", `TEXT DEFAULT '[]'`],
        ["next_opening_text", `TEXT DEFAULT ''`],
        ["next_open_day", `TEXT DEFAULT ''`],
        ["next_open_time", `TEXT DEFAULT ''`],
        ["visible_photos_count", `TEXT DEFAULT ''`],
        ["postal_code", `TEXT DEFAULT ''`],
        ["country", `TEXT DEFAULT ''`],
        ["city", `TEXT DEFAULT ''`],
        ["state", `TEXT DEFAULT ''`],
        ["source_place_id", `TEXT DEFAULT ''`],
        ["source_url", `TEXT DEFAULT ''`],
        ["popular_times", `TEXT DEFAULT '{}'`],
        ["rating_distribution", `TEXT DEFAULT '{}'`],
        ["review_highlights", `TEXT DEFAULT '[]'`],
        ["field_status", `TEXT DEFAULT '{}'`]
      ]) {
        try {
          await db.execute(`ALTER TABLE places ADD COLUMN ${column} ${definition};`);
        } catch {
        }
      }
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_places_job_id ON places (job_id);`);
      await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL,
      last_login_at TEXT
    );
  `);
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
      for (const [column, definition] of [["project_id", "TEXT"], ["category_id", "TEXT"]]) {
        try {
          await db.execute(`ALTER TABLE searches ADD COLUMN ${column} ${definition};`);
        } catch {
        }
      }
      const legacySearches = await db.execute(`
    SELECT id, user_id, project_name, segment, location, project_id, category_id
    FROM searches
    WHERE project_id IS NULL OR category_id IS NULL
  `);
      for (const row of legacySearches.rows) {
        const scope = row.user_id?.trim() || "legacy-unassigned";
        const projectName = row.project_name?.trim() || `${row.segment} \xB7 ${row.location}`;
        const project = row.project_id ? null : await resolveProject(scope, projectName);
        const category = row.category_id ? null : await resolveSearchCategory(scope, row.segment || "Sem categoria");
        if (project || category) {
          await db.execute({
            sql: `UPDATE searches SET project_id = COALESCE(project_id, ?), category_id = COALESCE(category_id, ?) WHERE id = ?`,
            args: [project?.id || null, category?.id || null, row.id]
          });
        }
      }
    })();
  }
  return initPromise;
}
async function findUserByEmail(email) {
  const result = await getDb().execute({ sql: "SELECT * FROM users WHERE email = ? LIMIT 1", args: [email.toLowerCase()] });
  return result.rows.length ? result.rows[0] : null;
}
async function findUserById(id) {
  const result = await getDb().execute({ sql: "SELECT id, email, display_name, role, created_at, last_login_at FROM users WHERE id = ? LIMIT 1", args: [id] });
  return result.rows.length ? result.rows[0] : null;
}
async function countUsers() {
  const result = await getDb().execute("SELECT COUNT(*) AS count FROM users");
  return Number(result.rows[0]?.count || 0);
}
async function createUser(input) {
  await getDb().execute({
    sql: "INSERT INTO users (id, email, display_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [input.id, input.email.toLowerCase(), input.displayName, input.passwordHash, input.role, input.createdAt]
  });
}
async function updateUserLogin(id, timestamp) {
  await getDb().execute({ sql: "UPDATE users SET last_login_at = ? WHERE id = ?", args: [timestamp, id] });
}
async function createApiCredential(input) {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO api_credentials (id, consumer_name, consumer_project, key_hash, status, created_at)
          VALUES (?, ?, ?, ?, 'active', ?)`,
    args: [input.id, input.consumerName, input.consumerProject, input.keyHash, input.createdAt]
  });
}
async function findActiveApiCredential(keyHash) {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, consumer_project FROM api_credentials WHERE key_hash = ? AND status = 'active' LIMIT 1`,
    args: [keyHash]
  });
  if (!result.rows.length) return null;
  const row = result.rows[0];
  await db.execute({ sql: `UPDATE api_credentials SET last_used_at = ? WHERE id = ?`, args: [(/* @__PURE__ */ new Date()).toISOString(), row.id] });
  return row;
}
async function revokeApiCredential(id) {
  const db = getDb();
  const result = await db.execute({
    sql: `UPDATE api_credentials SET status = 'revoked', revoked_at = ? WHERE id = ? AND status = 'active'`,
    args: [(/* @__PURE__ */ new Date()).toISOString(), id]
  });
  return Number(result.rowsAffected || 0) > 0;
}
async function listApiCredentials() {
  const db = getDb();
  const result = await db.execute(`SELECT id, consumer_name, consumer_project, status, created_at, last_used_at, revoked_at FROM api_credentials ORDER BY created_at DESC`);
  return result.rows;
}
async function createJob(job) {
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
      job.project_name || `${job.segment} \xB7 ${job.location}`,
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
      job.current_step || "",
      job.created_at,
      job.completed_at || null
    ]
  });
}
async function updateJobProgress(id, updates) {
  const db = getDb();
  const fields = [];
  const args = [];
  for (const [key, val] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    args.push(val);
  }
  if (fields.length === 0) return;
  args.push(id);
  await db.execute({
    sql: `UPDATE searches SET ${fields.join(", ")} WHERE id = ?`,
    args
  });
}
async function getJob(id, consumerProject) {
  const db = getDb();
  const res = await db.execute({
    sql: consumerProject ? `SELECT * FROM searches WHERE id = ? AND user_id = ?` : `SELECT * FROM searches WHERE id = ?`,
    args: consumerProject ? [id, consumerProject] : [id]
  });
  if (res.rows.length === 0) return null;
  return res.rows[0];
}
async function listJobs(consumerProject) {
  const db = getDb();
  const res = await db.execute({
    sql: consumerProject ? `SELECT * FROM searches WHERE user_id = ? ORDER BY created_at DESC` : `SELECT * FROM searches ORDER BY created_at DESC`,
    args: consumerProject ? [consumerProject] : []
  });
  return res.rows;
}
async function deleteJob(id, consumerProject) {
  const db = getDb();
  const job = await getJob(id, consumerProject);
  if (!job) return false;
  await db.execute({ sql: `DELETE FROM places WHERE job_id = ?`, args: [id] });
  await db.execute({ sql: `DELETE FROM searches WHERE id = ?`, args: [id] });
  return true;
}
async function insertPlace(place) {
  const db = getDb();
  await db.execute({
    sql: `INSERT OR REPLACE INTO places (
      id, job_id, name, category, address, phone, website,
      rating, review_count, price_range, opening_hours, business_status,
      latitude, longitude, maps_url, description, services_attributes,
      photos, videos, logo_url, booking_url, social_links, reviews, review_topics, additional_attributes, media_items, plus_code,
      attributes, accessibility_attributes, next_opening_text, next_open_day, next_open_time, visible_photos_count,
      postal_code, country, city, state, source_place_id, source_url, popular_times, rating_distribution, review_highlights, field_status, collected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      place.photos || "",
      place.videos || "",
      place.logo_url || "",
      place.booking_url || "",
      place.social_links || "",
      place.reviews || "[]",
      place.review_topics || "[]",
      place.additional_attributes || "{}",
      place.media_items || "[]",
      place.plus_code || "",
      place.attributes || "[]",
      place.accessibility_attributes || "[]",
      place.next_opening_text || "",
      place.next_open_day || "",
      place.next_open_time || "",
      place.visible_photos_count || "",
      place.postal_code || "",
      place.country || "",
      place.city || "",
      place.state || "",
      place.source_place_id || "",
      place.source_url || place.maps_url || "",
      place.popular_times || "{}",
      place.rating_distribution || "{}",
      place.review_highlights || "[]",
      place.field_status || "{}",
      place.collected_at
    ]
  });
}
async function updatePlace(id, place) {
  const db = getDb();
  await db.execute({
    sql: `UPDATE places SET
      name = ?, category = ?, address = ?, phone = ?, website = ?, rating = ?, review_count = ?,
      price_range = ?, opening_hours = ?, business_status = ?, latitude = ?, longitude = ?, maps_url = ?,
      description = ?, services_attributes = ?, photos = ?, videos = ?, logo_url = ?, booking_url = ?, social_links = ?,
      reviews = ?, review_topics = ?, additional_attributes = ?, media_items = ?, plus_code = ?,
      attributes = ?, accessibility_attributes = ?, next_opening_text = ?, next_open_day = ?, next_open_time = ?, visible_photos_count = ?,
      postal_code = ?, country = ?, city = ?, state = ?, source_place_id = ?, source_url = ?, popular_times = ?,
      rating_distribution = ?, review_highlights = ?, field_status = ?, collected_at = ?
      WHERE id = ?`,
    args: [
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
      place.photos || "",
      place.videos || "",
      place.logo_url || "",
      place.booking_url || "",
      place.social_links || "",
      place.reviews || "[]",
      place.review_topics || "[]",
      place.additional_attributes || "{}",
      place.media_items || "[]",
      place.plus_code || "",
      place.attributes || "[]",
      place.accessibility_attributes || "[]",
      place.next_opening_text || "",
      place.next_open_day || "",
      place.next_open_time || "",
      place.visible_photos_count || "",
      place.postal_code || "",
      place.country || "",
      place.city || "",
      place.state || "",
      place.source_place_id || "",
      place.source_url || place.maps_url || "",
      place.popular_times || "{}",
      place.rating_distribution || "{}",
      place.review_highlights || "[]",
      place.field_status || "{}",
      place.collected_at,
      id
    ]
  });
}
async function findPlaceByUrl(url, consumerProject) {
  if (!url || !url.trim()) return null;
  const db = getDb();
  const cleanUrl = url.trim().split("?")[0].replace(/\/$/, "");
  if (!cleanUrl) return null;
  const res = await db.execute({
    sql: consumerProject ? `SELECT p.* FROM places p INNER JOIN searches s ON s.id = p.job_id WHERE rtrim(substr(p.maps_url, 1, instr(p.maps_url || '?', '?') - 1), '/') = ? AND s.user_id = ? LIMIT 1` : `SELECT * FROM places WHERE rtrim(substr(maps_url, 1, instr(maps_url || '?', '?') - 1), '/') = ? LIMIT 1`,
    args: consumerProject ? [cleanUrl, consumerProject] : [cleanUrl]
  });
  return res.rows.length ? res.rows[0] : null;
}
async function placeExistsByUrl(url, _jobId) {
  return await findPlaceByUrl(url) !== null;
}
async function getPlaces(options) {
  const db = getDb();
  const whereClauses = [];
  const args = [];
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
  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const countRes = await db.execute({
    sql: `SELECT COUNT(*) as count FROM places ${whereSql}`,
    args
  });
  const total = Number(countRes.rows[0]?.count || 0);
  const allowedSortCols = ["name", "category", "rating", "review_count", "collected_at"];
  const sortBy = allowedSortCols.includes(options.sortBy || "") ? options.sortBy : "collected_at";
  const sortOrder = options.sortOrder === "asc" ? "ASC" : "DESC";
  const limit = options.limit || 50;
  const offset = options.offset || 0;
  const dataArgs = [...args, limit, offset];
  const dataRes = await db.execute({
    sql: `SELECT * FROM places ${whereSql} ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`,
    args: dataArgs
  });
  return {
    places: dataRes.rows,
    total
  };
}
async function getPlacesByIds(ids, consumerProject) {
  if (ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  const sql = consumerProject ? `SELECT places.* FROM places INNER JOIN searches s ON s.id = places.job_id WHERE places.id IN (${placeholders}) AND s.user_id = ? ORDER BY places.collected_at DESC` : `SELECT * FROM places WHERE id IN (${placeholders}) ORDER BY collected_at DESC`;
  const res = await db.execute({ sql, args: consumerProject ? [...ids, consumerProject] : ids });
  return res.rows;
}
async function getAllPlaces(jobId, consumerProject) {
  const db = getDb();
  const where = [];
  const args = [];
  if (jobId) {
    where.push("p.job_id = ?");
    args.push(jobId);
  }
  if (consumerProject) {
    where.push("s.user_id = ?");
    args.push(consumerProject);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const res = await db.execute({
    sql: `SELECT p.* FROM places p INNER JOIN searches s ON s.id = p.job_id ${whereSql} ORDER BY p.collected_at DESC`,
    args
  });
  return res.rows;
}
async function listPlaceCategories(consumerProject) {
  const db = getDb();
  const result = await db.execute({
    sql: consumerProject ? "SELECT DISTINCT trim(p.category) AS category FROM places p INNER JOIN searches s ON s.id = p.job_id WHERE trim(p.category) <> '' AND s.user_id = ? ORDER BY lower(trim(p.category)) ASC" : "SELECT DISTINCT trim(category) AS category FROM places WHERE trim(category) <> '' ORDER BY lower(trim(category)) ASC",
    args: consumerProject ? [consumerProject] : []
  });
  return result.rows.map((row) => String(row.category || "")).filter(Boolean);
}
async function countPlaces() {
  const db = getDb();
  const result = await db.execute("SELECT COUNT(*) AS count FROM places");
  return Number(result.rows[0]?.count ?? 0);
}
async function getLastCollectedPlaceForSearch(segment, location, consumerProject) {
  const db = getDb();
  const result = await db.execute({
    sql: consumerProject ? `SELECT p.* FROM places p INNER JOIN searches s ON s.id = p.job_id
          WHERE lower(trim(s.segment)) = lower(trim(?)) AND lower(trim(s.location)) = lower(trim(?)) AND s.user_id = ?
          ORDER BY p.collected_at DESC LIMIT 1` : `SELECT p.* FROM places p INNER JOIN searches s ON s.id = p.job_id
          WHERE lower(trim(s.segment)) = lower(trim(?)) AND lower(trim(s.location)) = lower(trim(?))
          ORDER BY p.collected_at DESC LIMIT 1`,
    args: consumerProject ? [segment, location, consumerProject] : [segment, location]
  });
  return result.rows.length ? result.rows[0] : null;
}
async function saveRunReport(jobId, reportJson, generatedAt) {
  const db = getDb();
  const compressed = "gzip-base64:" + gzipSync(Buffer.from(reportJson, "utf8")).toString("base64");
  await db.execute({
    sql: `INSERT INTO run_reports (job_id, report_json, generated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(job_id) DO UPDATE SET report_json = excluded.report_json, generated_at = excluded.generated_at`,
    args: [jobId, compressed, generatedAt]
  });
}
async function getRunReport(jobId) {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT report_json FROM run_reports WHERE job_id = ? LIMIT 1",
    args: [jobId]
  });
  const row = result.rows[0];
  if (typeof row?.report_json !== "string") return null;
  if (row.report_json.startsWith("gzip-base64:")) {
    return gunzipSync(Buffer.from(row.report_json.slice("gzip-base64:".length), "base64")).toString("utf8");
  }
  return row.report_json;
}
function normalizeCatalogName(value) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}
async function listProjects(consumerProject) {
  const result = await getDb().execute({
    sql: `SELECT * FROM projects WHERE consumer_project = ? ORDER BY name COLLATE NOCASE`,
    args: [consumerProject]
  });
  return result.rows;
}
async function resolveProject(consumerProject, name) {
  const canonicalName = name.trim().replace(/\s+/g, " ").slice(0, 120);
  const normalized = normalizeCatalogName(canonicalName);
  if (!normalized) throw new Error("project_name_required");
  const db = getDb();
  const existing = await db.execute({
    sql: `SELECT * FROM projects WHERE consumer_project = ? AND normalized_name = ? LIMIT 1`,
    args: [consumerProject, normalized]
  });
  if (existing.rows.length) return existing.rows[0];
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const record = {
    id: `prj_${randomUUID().replace(/-/g, "")}`,
    consumer_project: consumerProject,
    name: canonicalName,
    normalized_name: normalized,
    created_at: now,
    updated_at: now
  };
  await db.execute({
    sql: `INSERT INTO projects (id, consumer_project, name, normalized_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (consumer_project, normalized_name) DO NOTHING`,
    args: [record.id, record.consumer_project, record.name, record.normalized_name, record.created_at, record.updated_at]
  });
  const resolved = await db.execute({
    sql: `SELECT * FROM projects WHERE consumer_project = ? AND normalized_name = ? LIMIT 1`,
    args: [consumerProject, normalized]
  });
  return resolved.rows[0];
}
async function listSearchCategories(consumerProject) {
  const result = await getDb().execute({
    sql: `SELECT * FROM search_categories WHERE consumer_project = ? ORDER BY name COLLATE NOCASE`,
    args: [consumerProject]
  });
  return result.rows;
}
async function resolveSearchCategory(consumerProject, name) {
  const canonicalName = name.trim().replace(/\s+/g, " ").slice(0, 120);
  const normalized = normalizeCatalogName(canonicalName);
  if (!normalized) throw new Error("category_name_required");
  const db = getDb();
  const existing = await db.execute({
    sql: `SELECT * FROM search_categories WHERE consumer_project = ? AND normalized_name = ? LIMIT 1`,
    args: [consumerProject, normalized]
  });
  if (existing.rows.length) return existing.rows[0];
  const record = {
    id: `cat_${randomUUID().replace(/-/g, "")}`,
    consumer_project: consumerProject,
    name: canonicalName,
    normalized_name: normalized,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  await db.execute({
    sql: `INSERT INTO search_categories (id, consumer_project, name, normalized_name, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (consumer_project, normalized_name) DO NOTHING`,
    args: [record.id, record.consumer_project, record.name, record.normalized_name, record.created_at]
  });
  const resolved = await db.execute({
    sql: `SELECT * FROM search_categories WHERE consumer_project = ? AND normalized_name = ? LIMIT 1`,
    args: [consumerProject, normalized]
  });
  return resolved.rows[0];
}
async function updateProject(consumerProject, id, name) {
  const canonicalName = name.trim().replace(/\s+/g, " ").slice(0, 120);
  const normalized = normalizeCatalogName(canonicalName);
  if (!normalized) throw new Error("project_name_required");
  const db = getDb();
  const existing = await db.execute({
    sql: `SELECT * FROM projects WHERE id = ? AND consumer_project = ? LIMIT 1`,
    args: [id, consumerProject]
  });
  if (!existing.rows.length) return null;
  const conflict = await db.execute({
    sql: `SELECT * FROM projects WHERE consumer_project = ? AND normalized_name = ? AND id != ? LIMIT 1`,
    args: [consumerProject, normalized, id]
  });
  if (conflict.rows.length) throw new Error("project_name_conflict");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await db.execute({
    sql: `UPDATE projects SET name = ?, normalized_name = ?, updated_at = ? WHERE id = ? AND consumer_project = ?`,
    args: [canonicalName, normalized, now, id, consumerProject]
  });
  const updated = await db.execute({
    sql: `SELECT * FROM projects WHERE id = ? AND consumer_project = ? LIMIT 1`,
    args: [id, consumerProject]
  });
  return updated.rows[0];
}
async function deleteProject(consumerProject, id) {
  const db = getDb();
  const existing = await db.execute({
    sql: `SELECT * FROM projects WHERE id = ? AND consumer_project = ? LIMIT 1`,
    args: [id, consumerProject]
  });
  if (!existing.rows.length) return false;
  await db.execute({
    sql: `UPDATE searches SET project_id = NULL WHERE project_id = ? AND user_id = ?`,
    args: [id, consumerProject]
  });
  const res = await db.execute({
    sql: `DELETE FROM projects WHERE id = ? AND consumer_project = ?`,
    args: [id, consumerProject]
  });
  return (res.rowsAffected ?? 0) > 0;
}
async function updateSearchCategory(consumerProject, id, name) {
  const canonicalName = name.trim().replace(/\s+/g, " ").slice(0, 120);
  const normalized = normalizeCatalogName(canonicalName);
  if (!normalized) throw new Error("category_name_required");
  const db = getDb();
  const existing = await db.execute({
    sql: `SELECT * FROM search_categories WHERE id = ? AND consumer_project = ? LIMIT 1`,
    args: [id, consumerProject]
  });
  if (!existing.rows.length) return null;
  const conflict = await db.execute({
    sql: `SELECT * FROM search_categories WHERE consumer_project = ? AND normalized_name = ? AND id != ? LIMIT 1`,
    args: [consumerProject, normalized, id]
  });
  if (conflict.rows.length) throw new Error("category_name_conflict");
  await db.execute({
    sql: `UPDATE search_categories SET name = ?, normalized_name = ? WHERE id = ? AND consumer_project = ?`,
    args: [canonicalName, normalized, id, consumerProject]
  });
  const updated = await db.execute({
    sql: `SELECT * FROM search_categories WHERE id = ? AND consumer_project = ? LIMIT 1`,
    args: [id, consumerProject]
  });
  return updated.rows[0];
}
async function deleteSearchCategory(consumerProject, id) {
  const db = getDb();
  const existing = await db.execute({
    sql: `SELECT * FROM search_categories WHERE id = ? AND consumer_project = ? LIMIT 1`,
    args: [id, consumerProject]
  });
  if (!existing.rows.length) return false;
  await db.execute({
    sql: `UPDATE searches SET category_id = NULL WHERE category_id = ? AND user_id = ?`,
    args: [id, consumerProject]
  });
  const res = await db.execute({
    sql: `DELETE FROM search_categories WHERE id = ? AND consumer_project = ?`,
    args: [id, consumerProject]
  });
  return (res.rowsAffected ?? 0) > 0;
}
var dbClient, initPromise;
var init_db = __esm({
  "src/server/db.ts"() {
    dbClient = null;
    initPromise = null;
  }
});

// src/server/browserless-endpoint.ts
var browserless_endpoint_exports = {};
__export(browserless_endpoint_exports, {
  getBrowserEndpointDiagnostic: () => getBrowserEndpointDiagnostic,
  getBrowserWSEndpoint: () => getBrowserWSEndpoint
});
function getBrowserWSEndpoint() {
  const configured = process.env.BROWSER_WS_ENDPOINT?.trim();
  if (!configured) {
    throw new Error("Navegador remoto n\xE3o configurado: defina BROWSER_WS_ENDPOINT.");
  }
  let endpoint;
  try {
    endpoint = new URL(configured);
  } catch {
    throw new Error("BROWSER_WS_ENDPOINT n\xE3o \xE9 uma URL absoluta v\xE1lida.");
  }
  if (endpoint.protocol === "https:") endpoint.protocol = "wss:";
  else if (endpoint.protocol === "http:") endpoint.protocol = "ws:";
  if (endpoint.hostname.endsWith("browserless.io") && endpoint.pathname.replace(/\/$/, "") === "/screenshot") {
    endpoint.pathname = "/";
  }
  if (!["ws:", "wss:"].includes(endpoint.protocol)) {
    throw new Error("BROWSER_WS_ENDPOINT deve apontar para um endpoint WebSocket compat\xEDvel com Puppeteer.");
  }
  if (endpoint.hostname.endsWith("browserless.io") && endpoint.protocol !== "wss:") {
    throw new Error("Browserless Shared Cloud exige WebSocket seguro (wss).");
  }
  return endpoint.toString();
}
function getBrowserEndpointDiagnostic(endpoint) {
  const parsed = new URL(endpoint);
  return {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    hasCredentials: Boolean(parsed.username || parsed.password),
    hasQuery: Boolean(parsed.search),
    pathDepth: parsed.pathname.split("/").filter(Boolean).length,
    endpointLength: endpoint.length
  };
}
var init_browserless_endpoint = __esm({
  "src/server/browserless-endpoint.ts"() {
  }
});

// server.ts
init_db();
import express from "express";
import rateLimit from "express-rate-limit";
import path3 from "path";
import { fileURLToPath } from "url";

// src/server/scraper/runner.ts
init_db();
import puppeteer2 from "puppeteer";

// src/server/run-report.ts
init_db();
import fs from "node:fs/promises";
import path2 from "node:path";
import puppeteer from "puppeteer";

// src/server/audit-log.ts
init_db();
var SENSITIVE_FIELDS = /* @__PURE__ */ new Set([
  "segment",
  "location",
  "phone",
  "website",
  "cpf",
  "cnpj",
  "email",
  "password",
  "token",
  "creditCard",
  "bankAccount"
]);
function sanitizeMetadata(metadata) {
  const sanitized = {};
  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.has(lowerKey)) {
      sanitized[key] = "[REDACIONADO]";
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
async function initAuditLog() {
  const db = getDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      event TEXT NOT NULL,
      message TEXT NOT NULL,
      job_id TEXT NOT NULL DEFAULT '',
      metadata TEXT NOT NULL DEFAULT '{}'
    )
  `);
  await db.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_job_id ON audit_logs (job_id)");
}
async function writeAuditLog(input) {
  const db = getDb();
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  const sanitizedMetadata = sanitizeMetadata(input.metadata ?? {});
  const metadata = JSON.stringify(sanitizedMetadata);
  await db.execute({
    sql: "INSERT INTO audit_logs (id, created_at, level, category, event, message, job_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args: [
      `log_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      createdAt,
      input.level ?? "info",
      input.category,
      input.event,
      input.message.slice(0, 4e3),
      input.jobId ?? "",
      metadata.slice(0, 12e3)
    ]
  });
}
async function listAuditLogs(options = {}) {
  const db = getDb();
  const where = [];
  const args = [];
  if (options.level) {
    where.push("level = ?");
    args.push(options.level);
  }
  if (options.category) {
    where.push("category = ?");
    args.push(options.category);
  }
  if (options.jobId) {
    where.push("job_id = ?");
    args.push(options.jobId);
  }
  if (options.consumerProject) {
    where.push("EXISTS (SELECT 1 FROM searches s WHERE s.id = audit_logs.job_id AND s.user_id = ?)");
    args.push(options.consumerProject);
  }
  if (options.query?.trim()) {
    const q = `%${options.query.trim().slice(0, 200)}%`;
    where.push("(message LIKE ? OR event LIKE ? OR metadata LIKE ? OR job_id LIKE ?)");
    args.push(q, q, q, q);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const count = await db.execute({ sql: `SELECT COUNT(*) AS count FROM audit_logs ${clause}`, args });
  const requestedLimit = Number(options.limit ?? 100);
  const requestedOffset = Number(options.offset ?? 0);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(500, Math.floor(requestedLimit))) : 100;
  const offset = Number.isFinite(requestedOffset) ? Math.max(0, Math.floor(requestedOffset)) : 0;
  const result = await db.execute({
    sql: `SELECT * FROM audit_logs ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    args: [...args, limit, offset]
  });
  return { logs: result.rows, total: Number(count.rows[0]?.count ?? 0) };
}

// src/server/run-report.ts
var reportDirectory = path2.resolve(process.cwd(), "artifacts", "reports");
function missingFields(place) {
  const fields = [
    "name",
    "category",
    "address",
    "phone",
    "website",
    "rating",
    "review_count",
    "opening_hours",
    "business_status",
    "latitude",
    "longitude",
    "maps_url"
  ];
  return fields.filter((field) => !String(place[field] ?? "").trim());
}
function escapeHtml(value) {
  const entities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };
  return String(value ?? "").replace(/[&<>"']/g, (char) => entities[char] || char);
}
function renderReportHtml(report) {
  const saved = report.data_quality.processed_records || report.data_quality.saved_records;
  const duplicates = report.duplicates;
  const events = report.audit.events.slice(0, 80);
  const run = report.run;
  const rows = saved.map((item) => "<tr><td>" + escapeHtml(item.name) + "</td><td>" + escapeHtml(item.fields.category) + "</td><td>" + escapeHtml(item.fields.rating) + " (" + escapeHtml(item.fields.review_count) + ")</td><td>" + escapeHtml(item.fields.address) + "</td><td>" + escapeHtml(item.fields.phone) + "</td><td>" + escapeHtml(item.fields.website) + "</td><td>" + escapeHtml(item.missing_fields.join(", ") || "Nenhum") + "</td></tr>").join("");
  const duplicateRows = duplicates.map((item) => "<tr><td>" + escapeHtml(item.existingName || item.previewName) + "</td><td>" + escapeHtml(item.existingJobId) + "</td><td>" + escapeHtml(item.existingCollectedAt) + "</td><td>" + escapeHtml(item.mapsUrl) + "</td></tr>").join("");
  const eventRows = events.map((item) => "<tr><td>" + escapeHtml(item.created_at) + "</td><td>" + escapeHtml(item.level) + "</td><td>" + escapeHtml(item.event) + "</td><td>" + escapeHtml(item.message) + "</td></tr>").join("");
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:14mm 10mm}body{font:10px Arial,sans-serif;color:#18181b}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 8px}p{color:#52525b;margin:4px 0}.metrics{display:flex;gap:12px;margin:16px 0}.metric{border:1px solid #d4d4d8;border-radius:6px;padding:9px;min-width:110px}.metric strong{display:block;font-size:18px;margin-top:4px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #d4d4d8;padding:5px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f4f4f5}tr{break-inside:avoid}.note{margin-top:16px;font-size:9px}</style></head><body><h1>Relat\xF3rio de execu\xE7\xE3o MapScrape</h1><p>Gerado em ' + escapeHtml(report.generated_at) + " \xB7 Pesquisa " + escapeHtml(run.id) + "</p><p>Consulta: " + escapeHtml(run.segment) + " \xB7 " + escapeHtml(run.location) + " \xB7 Status: " + escapeHtml(run.status) + '</p><div class="metrics"><div class="metric">Base antes<strong>' + escapeHtml(report.database.total_before) + '</strong></div><div class="metric">Base depois<strong>' + escapeHtml(report.database.total_after) + '</strong></div><div class="metric">Crescimento l\xEDquido<strong>' + escapeHtml(report.database.net_growth) + '</strong></div><div class="metric">Salvos nesta pesquisa<strong>' + escapeHtml(report.database.records_saved_by_run) + '</strong></div><div class="metric">Duplicados<strong>' + escapeHtml(run.total_duplicates) + '</strong></div><div class="metric">Falhas<strong>' + escapeHtml(run.total_errors) + "</strong></div></div><p>" + escapeHtml(run.status_message) + "</p><h2>Registros salvos e qualidade dos campos</h2><table><thead><tr><th>Estabelecimento</th><th>Categoria</th><th>Nota / avalia\xE7\xF5es</th><th>Endere\xE7o</th><th>Telefone</th><th>Site</th><th>Campos ausentes</th></tr></thead><tbody>" + (rows || '<tr><td colspan="7">Nenhum registro novo salvo nesta execu\xE7\xE3o.</td></tr>') + "</tbody></table><h2>Duplicados ignorados</h2><table><thead><tr><th>Estabelecimento existente</th><th>Pesquisa original</th><th>Data da coleta original</th><th>Ficha Maps</th></tr></thead><tbody>" + (duplicateRows || '<tr><td colspan="4">Nenhum duplicado identificado.</td></tr>') + "</tbody></table><h2>Eventos t\xE9cnicos recentes (m\xE1ximo 80)</h2><table><thead><tr><th>Data</th><th>N\xEDvel</th><th>Evento</th><th>Mensagem</th></tr></thead><tbody>" + (eventRows || '<tr><td colspan="4">Sem eventos de auditoria.</td></tr>') + '</tbody></table><p class="note">Este relat\xF3rio documenta a execu\xE7\xE3o observada. N\xE3o comprova que o Google Maps apresentou todos os resultados poss\xEDveis. O JSON associado cont\xE9m os dados completos para an\xE1lise automatizada.</p></body></html>';
}
async function writeRunReport(jobId, baselineCount, options = {}) {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Cannot write run report: job ${jobId} was not found`);
  const [currentCount, savedPlaces, audit] = await Promise.all([
    countPlaces(),
    getAllPlaces(jobId),
    listAuditLogs({ jobId, limit: 500 })
  ]);
  const enrichedPlaceIds = Array.from(new Set(audit.logs.filter((event) => event.event === "place.enriched").flatMap((event) => {
    try {
      const metadata = JSON.parse(event.metadata || "{}");
      return typeof metadata.placeId === "string" ? [metadata.placeId] : [];
    } catch {
      return [];
    }
  })));
  const enrichedPlaces = enrichedPlaceIds.length ? await getPlacesByIds(enrichedPlaceIds) : [];
  const processedPlaces = Array.from(new Map([...savedPlaces, ...enrichedPlaces].map((place) => [place.id, place])).values());
  const finishEvent = audit.logs.find((event) => event.event === "job.finished");
  let finishMetadata = {};
  try {
    finishMetadata = JSON.parse(finishEvent?.metadata || "{}");
  } catch {
  }
  const duplicateEvents = audit.logs.filter((event) => event.event === "place.duplicate_skipped").map((event) => {
    let metadata = {};
    try {
      metadata = JSON.parse(event.metadata || "{}");
    } catch {
    }
    return { at: event.created_at, message: event.message, ...metadata };
  });
  const toPlaceQuality = (places) => places.map((place) => ({
    id: place.id,
    name: place.name,
    maps_url: place.maps_url,
    collected_at: place.collected_at,
    fields: place,
    missing_fields: missingFields(place),
    populated_fields: Object.keys(place).filter((key) => String(place[key] ?? "").trim()).length
  }));
  const savedQuality = toPlaceQuality(savedPlaces);
  const processedQuality = toPlaceQuality(processedPlaces);
  const report = {
    schema_version: 1,
    report_type: "mapscrape-run-audit",
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    application: "Tokenizaa/mapscrape-v2",
    run: job,
    database: {
      total_before: baselineCount,
      total_after: currentCount,
      net_growth: currentCount - baselineCount,
      records_saved_by_run: savedPlaces.length,
      records_enriched_by_run: enrichedPlaces.length,
      records_processed_by_run: processedPlaces.length,
      records_saved_by_run_matches_job_counter: processedPlaces.length === job.total_collected
    },
    collection: {
      requested_limit: job.limit_requested,
      status: job.status,
      total_found: job.total_found,
      total_collected: job.total_collected,
      total_duplicates: job.total_duplicates,
      total_errors: job.total_errors,
      duplicate_only_run: job.total_collected === 0 && job.total_duplicates > 0,
      reached_successful_new_record_target: job.total_collected >= job.limit_requested,
      scroll_attempts: Number(finishMetadata.scrollAttempts ?? 0),
      reached_end_of_list: Boolean(finishMetadata.reachedEndOfList ?? false),
      new_candidates_found: Number(finishMetadata.newCandidatesFound ?? finishMetadata.totalFound ?? 0)
    },
    data_quality: {
      records_with_missing_fields: processedQuality.filter((place) => place.missing_fields.length > 0).length,
      missing_field_frequency: Object.fromEntries(
        [...new Set(processedQuality.flatMap((place) => place.missing_fields))].map((field) => [field, processedQuality.filter((place) => place.missing_fields.includes(field)).length])
      ),
      saved_records: savedQuality,
      processed_records: processedQuality
    },
    duplicates: duplicateEvents,
    artifacts: { json_file: jobId + ".json", pdf_file: jobId + ".pdf", pdf_generated: false },
    audit: {
      returned_count: audit.logs.length,
      total_matching_events: audit.total,
      events: audit.logs,
      truncated: audit.total > audit.logs.length
    },
    interpretation: {
      database_growth_is_measured_by_before_after_count: true,
      zero_growth_is_not_reported_as_new_data: currentCount - baselineCount === 0,
      note: "O relat\xF3rio descreve evid\xEAncias locais observadas. Crescimento l\xEDquido e contagem por job s\xE3o m\xE9tricas distintas; n\xE3o comprovam que o Google Maps tenha retornado todos os resultados poss\xEDveis."
    }
  };
  const filePath = path2.join(reportDirectory, jobId + ".json");
  const pdfPath = path2.join(reportDirectory, jobId + ".pdf");
  if (options.generatePdf !== false && !process.env.VERCEL) {
    await fs.mkdir(reportDirectory, { recursive: true });
    let browser = null;
    try {
      report.artifacts.pdf_generated = true;
      browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] });
      const page = await browser.newPage();
      await page.setContent(renderReportHtml(report), { waitUntil: "domcontentloaded" });
      const pdf = await page.pdf({
        format: "A4",
        landscape: true,
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: "<div></div>",
        footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#71717a;">MapScrape \xB7 Relat\xF3rio de auditoria \xB7 <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
        margin: { top: "12mm", bottom: "14mm", left: "8mm", right: "8mm" }
      });
      await fs.writeFile(pdfPath, pdf);
    } catch (error) {
      report.artifacts.pdf_generated = false;
      report.artifacts.pdf_error = String(error?.message || error).slice(0, 1e3);
      await fs.unlink(pdfPath).catch(() => {
      });
    } finally {
      if (browser) await browser.close().catch(() => {
      });
    }
  }
  const json = JSON.stringify(report, null, 2) + "\n";
  await saveRunReport(jobId, json, report.generated_at);
  if (!process.env.VERCEL) {
    await fs.mkdir(reportDirectory, { recursive: true });
    await fs.writeFile(filePath, json, "utf8");
    if (options.updateLatest !== false) {
      await fs.writeFile(path2.join(reportDirectory, "latest-audit.json"), json, "utf8");
      if (report.artifacts.pdf_generated) await fs.copyFile(pdfPath, path2.join(reportDirectory, "latest-audit.pdf"));
      else await fs.unlink(path2.join(reportDirectory, "latest-audit.pdf")).catch(() => {
      });
    }
    return filePath;
  }
  return `database:run_reports/${jobId}`;
}
async function readRunReport(jobId) {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(jobId)) return null;
  try {
    const stored = await getRunReport(jobId);
    if (stored) return JSON.parse(stored);
  } catch (error) {
    console.error("Falha ao ler relat\xF3rio persistido:", error instanceof Error ? error.message : error);
  }
  if (!process.env.VERCEL) {
    try {
      const content = await fs.readFile(path2.join(reportDirectory, `${jobId}.json`), "utf8");
      return JSON.parse(content);
    } catch {
    }
  }
  return null;
}
async function readRunReportPdf(jobId) {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(jobId)) return null;
  try {
    return await fs.readFile(path2.join(reportDirectory, jobId + ".pdf"));
  } catch {
    return null;
  }
}

// src/server/scraper/normalizer.ts
function cleanText(val) {
  if (!val) return "";
  return val.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/[\uE000-\uF8FF]/g, "").trim();
}
function normalizeAddress(raw) {
  if (!raw) return "";
  let cleaned = cleanText(raw);
  cleaned = cleaned.replace(/^(endereço|address|adresse|dirección):\s*/i, "");
  return cleaned.trim();
}
function normalizePhone(raw) {
  if (!raw) return "";
  let cleaned = cleanText(raw);
  cleaned = cleaned.replace(/^(telefone|phone|téléphone|teléfono):\s*/i, "");
  cleaned = cleaned.replace(/^[\s]+/, "");
  return cleaned.trim();
}
function normalizeWebsite(raw) {
  if (!raw) return "";
  let cleaned = cleanText(raw);
  cleaned = cleaned.replace(/^(website|site|sito web|sitio web):\s*/i, "");
  cleaned = cleaned.replace(/^[\s]+/, "");
  return cleaned.trim();
}
function normalizeCategory(raw) {
  if (!raw) return "";
  let cleaned = cleanText(raw);
  cleaned = cleaned.replace(/^[·•\s]+|[·•\s]+$/g, "");
  return cleaned.trim();
}
function normalizeRating(raw) {
  if (!raw) return "";
  const cleaned = cleanText(raw);
  const match = cleaned.match(/(\d+[.,]\d+)/);
  if (match) {
    return match[1];
  }
  return cleaned;
}
function normalizeReviewCount(raw) {
  if (!raw) return "";
  const cleaned = cleanText(raw);
  const match = cleaned.match(/([\d.,]+)\s*(?:avaliações|reviews)?/i);
  if (match) {
    return match[1].replace(/[()]/g, "").trim();
  }
  return cleaned.replace(/[()]/g, "").trim();
}
function normalizePriceRange(raw) {
  if (!raw) return "";
  let cleaned = cleanText(raw);
  cleaned = cleaned.replace(/^(preço|price|prix|precio):\s*/i, "");
  return cleaned.trim();
}
function normalizeBusinessStatus(raw) {
  if (!raw) return "";
  const cleaned = cleanText(raw).replace(/\s+/g, " ").trim();
  if (/temporarily closed|fermé temporairement|cerrado temporalmente|fechado temporariamente/i.test(cleaned)) {
    return "Fechado temporariamente";
  }
  if (/permanently closed|fermé définitivement|cerrado permanentemente|fechado permanentemente/i.test(cleaned)) {
    return "Fechado permanentemente";
  }
  if (/(?:^|[^a-z])(?:open|ouvert|abierto|aberta|aberto)(?:$|[^a-z])/i.test(cleaned)) {
    const next = cleaned.match(/(?:closes|closing|ferme|fermera|fecha)\s+(?:at|à|a|às|as)?\s*([\d: h.]+)/i);
    return next ? `Aberto \xB7 fecha \xE0s ${next[1].trim()}` : "Aberto";
  }
  if (/(?:^|[^a-z])(?:closed|fermé|fermée|cerrado|cerrada|fechado|fechada)(?:$|[^a-z])/i.test(cleaned)) {
    return "Fechado";
  }
  return cleaned;
}
function parseAddressComponents(raw) {
  const address = normalizeAddress(raw);
  const postal_code = address.match(/\b\d{5}-\d{3}\b/)?.[0] || address.match(/\b\d{5}\b/)?.[0] || address.match(/\b[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}\b/i)?.[0] || "";
  const stateMatch = address.match(/(?:-|,)\s*([A-Z]{2})(?=\s*(?:\d{5}(?:-\d{3})?|,|$))/);
  const state = stateMatch?.[1] || "";
  const countryMatch = address.match(/,\s*(Brazil|Brasil|United States|United Kingdom|Canada|Australia|Portugal|España|Spain|France|Deutschland|Germany|Italy|México|Mexico)\s*$/i);
  const country = countryMatch?.[1] || "";
  let city = "";
  if (stateMatch && typeof stateMatch.index === "number") {
    const beforeState = address.slice(0, stateMatch.index).split(",").map((part) => part.trim()).filter(Boolean);
    city = (beforeState[beforeState.length - 1] || "").split(/\s+-\s+/).pop()?.trim() || "";
  } else if (country && address.split(",").length >= 2) {
    const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
    city = parts[parts.length - 2] || "";
  }
  return { postal_code, country, city, state };
}
function extractSourcePlaceId(url) {
  const value = String(url || "");
  return value.match(/(0x[0-9a-f]+:0x[0-9a-f]+)/i)?.[1] || value.match(/!1s([^!/?]+)/)?.[1] || "";
}
function extractCoordinates(url) {
  if (!url) return { latitude: "", longitude: "" };
  const match3d = url.match(/!3d(-?\d+(?:\.\d+)?)/);
  const match4d = url.match(/!4d(-?\d+(?:\.\d+)?)/);
  if (match3d && match4d) {
    return { latitude: match3d[1], longitude: match4d[1] };
  }
  const matchAt = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (matchAt) {
    return { latitude: matchAt[1], longitude: matchAt[2] };
  }
  return { latitude: "", longitude: "" };
}

// src/server/scraper/selectors.ts
var SELECTORS = {
  feed: {
    container: [
      'div[role="feed"]',
      "div.m6QErb[aria-label]",
      "div.TFQHme",
      'div[role="main"]'
    ],
    placeLinks: [
      'a.hfpxzc[href*="/maps/place/"]',
      'div[role="feed"] a[href*="/maps/place/"]',
      'div.Nv2PK a[href*="/maps/place/"]',
      'a[href*="/maps/place/"]'
    ],
    endOfList: [
      "span.HlvSq",
      "div.m6QErb div.HlvSq",
      "div.HlvSq",
      "div.PbZDve"
    ]
  },
  place: {
    title: [
      "h1.DUwDvf",
      "h1.fontHeadlineLarge",
      'div[role="main"] h1',
      "h1"
    ],
    category: [
      'button[jsaction*="pane.rating.category"]',
      "button.DkEaL",
      "span.Y0A0hc",
      'button[jsaction*="category"]'
    ],
    rating: [
      'div.F7nice span[aria-hidden="true"]',
      "span.ceNzKf",
      "div.fontDisplayLarge",
      'div[role="main"] span[aria-label*="estrelas"]',
      'div[role="main"] span[aria-label*="star"]'
    ],
    reviews: [
      "div.F7nice span:last-child",
      'span[aria-label*="avalia\xE7\xF5es"]',
      'span[aria-label*="reviews"]',
      'button[jsaction*="pane.reviewChart.moreReviews"]',
      "span.UY7F9"
    ],
    priceRange: [
      'span[aria-label*="Pre\xE7o:"]',
      'span[aria-label*="Price:"]',
      "span.mgr77e span",
      "span.mgr77e"
    ],
    address: [
      'button[data-item-id="address"] div.fontBodyMedium',
      'button[data-item-id="address"]',
      '[data-item-id="address"]',
      'button[aria-label*="Endere\xE7o:"]',
      'button[aria-label*="Address:"]'
    ],
    website: [
      'a[data-item-id="authority"]',
      'a[aria-label*="Website:"]',
      'a[aria-label*="Site:"]',
      '[data-item-id="authority"]'
    ],
    phone: [
      'button[data-item-id^="phone:"] div.fontBodyMedium',
      'button[data-item-id^="phone:"]',
      'button[aria-label*="Telefone:"]',
      'button[aria-label*="Phone:"]',
      '[data-item-id^="phone:"]'
    ],
    businessStatus: [
      "span.ZDu9vd span:first-child",
      "div.OM3Cfd span:first-child",
      'div[aria-label*="Aberto"]',
      'div[aria-label*="Fechado"]',
      "span.o0Svhf"
    ],
    hours: [
      'div[aria-label*="Hor\xE1rio"]',
      "div.t39EBf",
      "span.ZDu9vd",
      "table.eKjhbv",
      "div.OM3Cfd"
    ],
    description: [
      "div.PYvSYb",
      "div.WeS02d",
      "div.bJzME.Hu9e2e div.loref",
      "div.w70O2e"
    ],
    services: [
      "div.E0dtEd",
      "div.dr4qPd",
      "div.LTs0Rc",
      'div[aria-label*="Servi\xE7os"]',
      "div.jANrlb"
    ],
    photos: [
      'button[jsaction*="heroHeader"] img',
      "button.aoRNLd img",
      "div.m6QErb img.uetUYb",
      'img[src*="googleusercontent.com/p/"]',
      'img[src*="googleusercontent.com"]',
      'img[data-src*="googleusercontent.com"]',
      'button[aria-label*="Ver todas as fotos"] img',
      'button[aria-label*="See all photos"] img',
      'div[role="main"] img[src^="https://lh3.googleusercontent.com/"]',
      'button[aria-label*="Foto"] img',
      "div.Z5vB5 img",
      "div.RZ66Rb img"
    ],
    videos: [
      "video",
      "video source",
      'div[aria-label*="V\xEDdeo"] video',
      'div[aria-label*="Video"] video',
      'a[href*="youtube.com/watch"]',
      'a[href*="youtu.be"]',
      'button[aria-label*="V\xEDdeo"]',
      'button[aria-label*="Video"]',
      "div[data-video-url]"
    ],
    logo: [
      "div.lMbq3e img",
      "img.uetUYb",
      'button[jsaction*="pane.photo"] img',
      'img[src*="googleusercontent.com"]'
    ]
  }
};

// src/server/scraper/extractor.ts
async function extractPlaceDetails(page, jobId, targetUrl) {
  try {
    await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll("button"));
      const hoursButton = candidates.find((button) => {
        const label = [button.getAttribute("aria-label") || "", button.innerText || ""].join(" ");
        return button.getAttribute("data-item-id") === "oh" || /horários de funcionamento|opening hours|horario de apertura|heures d.?ouverture/i.test(label);
      });
      if (hoursButton) hoursButton.click();
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
  } catch {
  }
  const raw = await page.evaluate(async (selectors) => {
    if (typeof window.__name === "undefined") window.__name = (f) => f;
    if (typeof globalThis.__name === "undefined") globalThis.__name = (f) => f;
    const text = (el) => el?.innerText?.trim() || "";
    const attr = (el, name2) => el?.getAttribute(name2)?.trim() || "";
    const first = (sels) => {
      for (const selector of sels) {
        try {
          const el = document.querySelector(selector);
          if (el) return el;
        } catch {
        }
      }
      return null;
    };
    const firstText = (sels) => {
      for (const selector of sels) {
        try {
          const el = document.querySelector(selector);
          const value = text(el);
          if (value) return value;
        } catch {
        }
      }
      return "";
    };
    const firstAttr = (sels, name2) => {
      for (const selector of sels) {
        try {
          const el = document.querySelector(selector);
          const value = attr(el, name2);
          if (value) return value;
        } catch {
        }
      }
      return "";
    };
    const cleanLabel = (value) => value.replace(/^(endereço|address|adresse|dirección|telefone|phone|téléphone|teléfono|site|website|sito web|sitio web|preço|price|prix)\s*:\s*/i, "").trim();
    const name = firstText(selectors.title);
    const category = firstText(selectors.category);
    const ratingNode = first([
      'div.F7nice span[aria-hidden="true"]',
      'span[role="img"][aria-label*="estrelas"]',
      'span[role="img"][aria-label*="stars"]',
      'div.F7nice span[aria-label*="star"]',
      'div.F7nice span[aria-label*="estrela"]',
      ...selectors.rating
    ]);
    const ratingLabel = [attr(ratingNode, "aria-label"), text(ratingNode)].filter(Boolean).join(" ");
    const ratingMatch = ratingLabel.match(/([0-5][.,]\d)/);
    const rating = ratingMatch?.[1] || firstText(selectors.rating);
    const reviewNode = first([
      "div.F7nice button[aria-label]",
      'button[jsaction*="pane.reviewChart.moreReviews"]',
      ...selectors.reviews
    ]);
    const reviewLabel = [attr(reviewNode, "aria-label"), text(reviewNode)].filter(Boolean).join(" ");
    const parseReviewCount = (value) => {
      const normalized = value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
      const labeled = normalized.match(/(\d{1,3}(?:[.\s]\d{3})+|\d+(?:[.,]\d+)?(?:\s*(?:mil|k|thousand))?)\s*(?:avaliações?|reviews?|opiniones?|avis|bewertung(?:en)?|recensioni)/i);
      if (labeled) return labeled[1].trim();
      const parenthesized = normalized.match(/[([]\s*([\d][\d\s.,]*(?:\s*(?:mil|k))?)\s*[)\]]/i);
      if (parenthesized && !/^\d[.,]\d$/.test(parenthesized[1].trim())) return parenthesized[1].trim();
      const bareCount = normalized.match(/^\(?\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*\)?$/);
      return bareCount?.[1] || "";
    };
    const ratingCluster = first(["div.F7nice", 'div[role="main"] div.F7nice']);
    const reviewSources = [
      reviewLabel,
      ratingLabel,
      text(ratingCluster),
      attr(ratingCluster, "aria-label"),
      ...Array.from(document.querySelectorAll(
        'button[jsaction*="pane.reviewChart.moreReviews"], [aria-label*="avalia\xE7\xF5es"], [aria-label*="reviews"], [aria-label*="opiniones"], [aria-label*="recensioni"]'
      )).map((el) => [attr(el, "aria-label"), text(el)].filter(Boolean).join(" ")),
      ...Array.from(ratingCluster?.querySelectorAll("span,button") || []).map(
        (el) => [attr(el, "aria-label"), text(el)].filter(Boolean).join(" ")
      )
    ].filter(Boolean);
    const review_count = reviewSources.map(parseReviewCount).find(Boolean) || "";
    const addressNode = first(['button[data-item-id="address"]', '[data-item-id="address"]', ...selectors.address]);
    const phoneNode = first(['button[data-item-id^="phone:tel:"]', 'button[data-item-id^="phone:"]', ...selectors.phone]);
    const websiteNode = first(['a[data-item-id="authority"][href]', ...selectors.website]);
    const priceNode = first([
      'span[aria-label^="Pre\xE7o:"]',
      'span[aria-label^="Price:"]',
      'span[aria-label^="Prix:"]',
      'span[aria-label^="Precio:"]',
      ...selectors.priceRange
    ]);
    const address2 = cleanLabel(attr(addressNode, "aria-label") || text(addressNode));
    const phone = cleanLabel(attr(phoneNode, "aria-label") || text(phoneNode));
    const website = attr(websiteNode, "href") || cleanLabel(attr(websiteNode, "aria-label") || text(websiteNode));
    const price_range = cleanLabel(attr(priceNode, "aria-label") || text(priceNode));
    const hoursTable = first([
      'table[aria-label*="Hor\xE1rio"]',
      'table[aria-label*="Hours"]',
      'table[aria-label*="Heures"]',
      'table[aria-label*="Horario"]',
      "table.eKjhbv"
    ]) || Array.from(document.querySelectorAll("table")).find(
      (table) => Array.from(table.querySelectorAll("tr")).some(
        (row) => /segunda|terça|quarta|quinta|sexta|sábado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche/i.test(text(row))
      )
    ) || null;
    const dayPattern = /segunda(?:-feira)?|terça(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sábado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag/i;
    const scheduleRows = /* @__PURE__ */ new Set();
    const addScheduleRow = (value) => {
      const normalized = value.replace(/\s+/g, " ").trim();
      if (normalized && dayPattern.test(normalized) && /\d{1,2}[:h.]?\d{0,2}|fechado|closed|aberto|open|24 horas/i.test(normalized)) {
        scheduleRows.add(normalized);
      }
    };
    if (hoursTable) {
      Array.from(hoursTable.querySelectorAll('tr,[role="row"]')).forEach((row) => addScheduleRow(text(row)));
    }
    document.querySelectorAll('[role="row"],[aria-label],[data-item-id="oh"],button[data-item-id="oh"]').forEach((node) => {
      const value = [attr(node, "aria-label"), text(node)].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      if (value.length < 220) addScheduleRow(value);
    });
    let opening_hours = Array.from(scheduleRows).join(" | ");
    if (!opening_hours) {
      const hoursButton = first([
        'button[data-item-id="oh"]',
        'button[aria-label*="Hor\xE1rios de funcionamento"]',
        'button[aria-label*="Opening hours"]',
        'button[aria-label*="Heures d\u2019ouverture"]',
        'button[aria-label*="Horario de apertura"]'
      ]);
      const buttonText = text(hoursButton) || attr(hoursButton, "aria-label");
      opening_hours = dayPattern.test(buttonText) ? buttonText : "";
    }
    const statusCandidates = Array.from(document.querySelectorAll(
      '[aria-label*="Aberto"], [aria-label*="Fechado"], [aria-label*="Open"], [aria-label*="Closed"],[aria-label*="Ferm\xE9"], [aria-label*="Ouvert"], [aria-label*="Cerrado"], [aria-label*="Abierto"],.ZDu9vd, .o0Svhf'
    ));
    const statusText = statusCandidates.map((el) => attr(el, "aria-label") || text(el)).find((value) => /aberto|fechado|open|closed|fermé|fermée|ouvert|abierto|cerrado/i.test(value)) || "";
    const nextOpeningText = statusText.match(/(?:abre|opens|reopens|abertura)[^·|]*/i)?.[0]?.trim() || "";
    const openingDayMatch = nextOpeningText.match(/\b(segunda(?:-feira)?|terça(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sábado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i);
    const openingTimeMatch = nextOpeningText.match(/\b(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?|\d{1,2}h(?:\d{2})?)\b/i);
    const description = firstText([
      '[data-item-id="description"]',
      '[aria-label*="Descri\xE7\xE3o"]',
      '[aria-label*="From the business"]',
      '[aria-label*="Da empresa"]',
      ...selectors.description
    ]);
    const serviceSelectors = [
      '[aria-label*="Servi\xE7os"]',
      '[aria-label*="Services"]',
      '[aria-label*="Menu"]',
      '[aria-label*="Products and services"]',
      '[data-item-id*="service"]',
      '[data-item-id*="menu"]',
      '[role="main"] [class*="service"]',
      '[role="main"] [class*="Service"]',
      ...selectors.services
    ];
    const serviceEls = Array.from(document.querySelectorAll(serviceSelectors.join(", ")));
    const serviceLines = serviceEls.flatMap((element) => {
      const value = text(element).replace(/\s+/g, " ").trim();
      const descendants = Array.from(element.querySelectorAll('li,[role="listitem"],button,[role="button"],a')).map((child) => text(child).replace(/\s+/g, " ").trim()).filter(Boolean);
      return [value, ...descendants];
    });
    const services_attributes = Array.from(new Set(serviceLines.filter((value) => value && value.length < 1200).filter((value) => !/^(serviços|services|acessibilidade|accessibility|menu|products and services)$/i.test(value)).filter((value) => !/^(ver mais|show more|saiba mais|learn more)$/i.test(value)))).join(" \xB7 ");
    const photoUrls = [];
    const seenPhotos = /* @__PURE__ */ new Set();
    const addPhoto = (candidate) => {
      const src = (candidate || "").trim().split(/\s+/)[0];
      if (!src.startsWith("http") || /cleardot\.gif|gstatic\.com\/images\/branding/i.test(src)) return;
      const dimensions = src.match(/(?:=|[-_])(?:w|s)(\d{1,4})(?:-h(\d{1,4}))?/i);
      const queryWidth = src.match(/[?&](?:width|w)=(\d{1,4})/i);
      const queryHeight = src.match(/[?&](?:height|h)=(\d{1,4})/i);
      const width = Number(dimensions?.[1] || queryWidth?.[1] || 0);
      const height = Number(dimensions?.[2] || queryHeight?.[1] || 0);
      if (width > 0 && width <= 64 || height > 0 && height <= 64 || /=s(?:16|24|32|40|48|64)(?:-c)?(?:-[a-z]+)?$/i.test(src)) return;
      if (!seenPhotos.has(src)) {
        seenPhotos.add(src);
        photoUrls.push(src);
      }
    };
    for (const selector of selectors.photos) {
      try {
        document.querySelectorAll(selector).forEach((el) => {
          const image = el;
          addPhoto(image.currentSrc || image.src || attr(el, "src"));
          addPhoto(attr(el, "data-src"));
          const srcset = attr(el, "srcset");
          if (srcset) srcset.split(",").forEach((part) => addPhoto(part.trim().split(/\s+/)[0]));
        });
      } catch {
      }
    }
    const socialHosts = /(^|\.)(instagram\.com|facebook\.com|fb\.com|tiktok\.com|youtube\.com|youtu\.be|linkedin\.com|x\.com|twitter\.com|pinterest\.com|threads\.net|wa\.me|whatsapp\.com)$/i;
    const socialUrls = [];
    const seenSocial = /* @__PURE__ */ new Set();
    document.querySelectorAll("a[href]").forEach((anchor) => {
      const href = attr(anchor, "href");
      try {
        const url = new URL(href, window.location.href);
        const host = url.hostname.toLowerCase().replace(/^www\./, "");
        if (socialHosts.test(host) && !seenSocial.has(url.href)) {
          seenSocial.add(url.href);
          socialUrls.push(url.href);
        }
      } catch {
      }
    });
    const bookingUrl = (() => {
      const candidates = Array.from(document.querySelectorAll('a[href], button, [role="button"]')).map((node) => {
        const label = [
          node.innerText || "",
          node.getAttribute("aria-label") || "",
          node.getAttribute("data-tooltip") || "",
          node.getAttribute("data-item-id") || "",
          node.getAttribute("title") || ""
        ].join(" ").replace(/\s+/g, " ").trim();
        const href = node.getAttribute("href") || node.getAttribute("data-href") || "";
        return { node, label, href };
      }).filter(({ label, href }) => {
        if (!href || /^(?:javascript:|#)$/i.test(href)) return false;
        return /\b(?:agendar(?:\s+on[- ]?line)?|marcar\s+(?:um\s+)?hor[aá]rio|book\s+online|online\s+booking|reserv(?:ar|e|ation)|appointment|agendamento)\b/i.test(label) || /\b(?:avec\.beauty|booksy\.com|fresha\.com|treatwell\.|square\.site|mindbodyonline\.com)\b/i.test(href);
      });
      for (const candidate of candidates) {
        try {
          const url = new URL(candidate.href, window.location.href);
          if (url.protocol === "https:" || url.protocol === "http:") return url.href;
        } catch {
        }
      }
      return "";
    })();
    const videoUrls = [];
    const seenVideos = /* @__PURE__ */ new Set();
    for (const selector of selectors.videos) {
      try {
        document.querySelectorAll(selector).forEach((el) => {
          const media = el;
          const src = media.currentSrc || media.src || attr(el, "src") || attr(el, "href") || attr(el, "data-video-url");
          const accessibleLabel = attr(el, "aria-label") || el.innerText || "";
          if (src.startsWith("http") && !src.includes("cleardot.gif") && !seenVideos.has(src)) {
            seenVideos.add(src);
            videoUrls.push(src);
          } else if (/video|vídeo/i.test(accessibleLabel) && !seenVideos.has(accessibleLabel)) {
            seenVideos.add(accessibleLabel);
            videoUrls.push(accessibleLabel);
          }
        });
      } catch {
      }
    }
    const clickByText = (pattern) => {
      const element = Array.from(document.querySelectorAll('button,[role="button"],[role="tab"]')).find((candidate) => pattern.test([
        candidate.innerText || "",
        candidate.getAttribute("aria-label") || ""
      ].join(" ").replace(/\s+/g, " ").trim()));
      if (!element) return false;
      element.click();
      return true;
    };
    const reviewTab = Array.from(document.querySelectorAll('button,[role="tab"],[role="button"]')).find(
      (candidate) => /reviews?|avaliações?|comentários?/i.test([
        candidate.innerText || "",
        candidate.getAttribute("aria-label") || "",
        candidate.getAttribute("data-tab") || ""
      ].join(" ")) && !/sort|ordenar|translate|traduzir|reply|responder/i.test([
        candidate.innerText || "",
        candidate.getAttribute("aria-label") || ""
      ].join(" "))
    );
    if (reviewTab) reviewTab.click();
    else clickByText(/^Reviews$|Reviews for|Avaliações|Comentários/i);
    await new Promise((resolve) => setTimeout(resolve, 350));
    clickByText(/^More reviews|Mais avaliações|Mais comentários|Ver todas as avaliações|See all reviews/i);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const reviews = [];
    const seenReviewIds = /* @__PURE__ */ new Set();
    let reviewContainer = null;
    const findReviewContainer = () => {
      const firstReview = document.querySelector("[data-review-id].jftiEf, .jftiEf[data-review-id]");
      let parent = firstReview?.parentElement;
      while (parent && parent !== document.body) {
        if (parent.scrollHeight > parent.clientHeight + 80 && parent.clientHeight > 100) return parent;
        parent = parent.parentElement;
      }
      const dialog = document.querySelector('[role="dialog"]');
      return dialog;
    };
    const readReviews = () => {
      document.querySelectorAll(".jftiEf[data-review-id], [data-review-id].jftiEf").forEach((card) => {
        const id = card.getAttribute("data-review-id") || "";
        if (!id || seenReviewIds.has(id)) return;
        seenReviewIds.add(id);
        const getText = (selectors2) => {
          for (const selector of selectors2) {
            const node = card.querySelector(selector);
            const value = node?.innerText?.trim() || "";
            if (value) return value;
          }
          return "";
        };
        const getAttr = (selectors2, attribute) => {
          for (const selector of selectors2) {
            const node = card.querySelector(selector);
            const value = node?.getAttribute(attribute)?.trim() || "";
            if (value) return value;
          }
          return "";
        };
        const media = [
          ...Array.from(card.querySelectorAll("img")).map((img) => ({ type: "image", url: img.currentSrc || img.src, alt: img.getAttribute("alt") || "" })).filter((item) => item.url.startsWith("http") && !/NBa7we|w36-h36|avatar/i.test(item.url)),
          ...Array.from(card.querySelectorAll('video, a[href$=".mp4"], a[href$=".webm"], [data-video-url]')).map((node) => ({
            type: "video",
            url: node.currentSrc || node.src || attr(node, "href") || attr(node, "data-video-url"),
            alt: attr(node, "aria-label") || "V\xEDdeo anexado \xE0 avalia\xE7\xE3o"
          })).filter((item) => item.url.startsWith("http"))
        ];
        const ratingNode2 = card.querySelector('[role="img"][aria-label*="star"],[role="img"][aria-label*="estrela"],span[aria-label*="star"],span[aria-label*="estrela"]');
        reviews.push({
          id,
          author: getText([".d4r55", ".WNxzHc .fontTitleMedium", 'button[aria-label^="Photo of"]']),
          author_profile_url: getAttr(["button[data-href]"], "data-href"),
          author_avatar_url: getAttr(['button[aria-label^="Photo of"] img', "img.NBa7we"], "src"),
          author_metadata: getText([".GHT2ce", ".RfnDt"]),
          rating: ratingNode2?.getAttribute("aria-label") || "",
          date: getText([".rsqaWe", ".DU9Pgb", 'span[class*="rsqaWe"]']),
          text: getText([".wiI7pd", ".MyEned", ".review-full-text"]),
          owner_response: getText([".CDe7pd", ".bwb7ce", ".ODSEW-ShBeI"]),
          media,
          helpful_count: getText([".GBkF3d", 'button[aria-label*="like"]'])
        });
      });
    };
    reviewContainer = findReviewContainer();
    const expandVisibleReviews = () => {
      document.querySelectorAll(".jftiEf button").forEach((button) => {
        if (/see more|mais|ver mais|plus/i.test(button.textContent || button.getAttribute("aria-label") || "")) {
          button.click();
        }
      });
    };
    let lastCount = -1;
    let stagnant = 0;
    for (let iteration = 0; iteration < 80; iteration++) {
      expandVisibleReviews();
      await new Promise((resolve) => setTimeout(resolve, 35));
      readReviews();
      if (reviews.length === lastCount) stagnant += 1;
      else stagnant = 0;
      if (stagnant >= 8) break;
      lastCount = reviews.length;
      if (!reviewContainer) reviewContainer = findReviewContainer();
      if (reviewContainer) reviewContainer.scrollTop = reviewContainer.scrollHeight;
      else window.scrollTo(0, document.body.scrollHeight);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    expandVisibleReviews();
    await new Promise((resolve) => setTimeout(resolve, 35));
    readReviews();
    clickByText(/^(?:View \d+ more Topics|Ver \d+ tópicos? a mais|Ver mais tópicos|Mais tópicos|Ver mais temas)$/i);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const review_topics = Array.from(document.querySelectorAll(
      '[data-review-topic], [role="radio"], [role="checkbox"], button[aria-pressed="true"], button[aria-selected="true"]'
    )).filter((node) => !node.closest(".jftiEf") && node.getAttribute("role") !== "tab").map((node) => {
      const label = (node.innerText || node.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
      const count = (label.match(/(?:\(|\s)(\d{1,6})\s*\)?$/) || [])[1] || "";
      return { label, count, node };
    }).filter((item) => item.label && item.label.length < 100).filter((item) => !/^(all reviews|todas as avaliações|avaliações|reviews|all|todas|overview|visão geral|about|sobre|standard|padrão|satellite|satélite|globe view|visualização do globo|markers|marcadores|map layers|camadas do mapa|most relevant|mais relevantes|newest|mais recentes|sort by|ordenar por|more reviews|mais avaliações|translate|traduzir|like|gostei|reply|responder)$/i.test(item.label)).filter((item) => !!item.count || !!item.node.hasAttribute("data-review-topic")).map(({ label, count }) => ({ label, count }));
    const aboutTabClicked = clickByText(/^(?:About(?:\s|$)|Sobre(?:\s|$)|Informações(?:\s|$))/i);
    await new Promise((resolve) => setTimeout(resolve, 180));
    const aboutText = (document.querySelector('div[role="main"]')?.innerText || "").split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 300).join("\n");
    const additional_attributes = {
      about_text: aboutTabClicked ? aboutText.slice(0, 18e3) : "",
      sections: aboutTabClicked ? Array.from(document.querySelectorAll('div[role="main"] h2, div[role="main"] h3')).map((heading) => {
        const category2 = (heading.innerText || "").replace(/\s+/g, " ").trim();
        const root = heading.parentElement?.parentElement || heading.parentElement;
        const items = (root?.innerText || "").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter((line) => line && line !== category2 && line.length < 180);
        return { category: category2, items: Array.from(new Set(items)) };
      }).filter((section) => section.category && section.items.length).slice(0, 60) : [],
      labeled_attributes: aboutTabClicked ? Array.from(document.querySelectorAll('div[role="main"] button, div[role="main"] [role="button"]')).map((node) => ({
        label: node.getAttribute("aria-label") || "",
        value: (node.innerText || "").replace(/\s+/g, " ").trim()
      })).filter((item) => item.label || item.value).filter((item) => item.value.length < 500).filter((item) => !/^(overview|visão geral|about|sobre|see more|ver mais|standard|padrão|satellite|satélite|globe view|visualização do globo|markers|marcadores)$/i.test(item.value)).slice(0, 200) : []
    };
    const attributeSections = Array.isArray(additional_attributes.sections) ? additional_attributes.sections : [];
    const allAttributeItems = attributeSections.flatMap(
      (section) => (Array.isArray(section.items) ? section.items : []).map((item) => String(item || "").trim()).filter(Boolean)
    );
    const attributes = Array.from(new Set(allAttributeItems.filter(
      (item) => !/wheelchair|cadeira de rodas|acessibilidade|accessible entrance|accessible parking|acessível/i.test(item)
    )));
    const accessibility_attributes = Array.from(new Set(allAttributeItems.filter(
      (item) => /wheelchair|cadeira de rodas|acessibilidade|accessible entrance|accessible parking|acessível|accessible restroom|banheiro acessível/i.test(item)
    )));
    const structuredAttributeLines = (additional_attributes.sections || []).flatMap((section) => {
      const category2 = String(section.category || "").trim();
      const items = Array.isArray(section.items) ? section.items.map((item) => String(item || "").trim()).filter(Boolean) : [];
      const usefulItems = items.filter((item) => !/^(?:||ver mais|show more|saiba mais|learn more)$/i.test(item));
      return category2 && usefulItems.length ? [category2 + ": " + usefulItems.join(", ")] : [];
    });
    const servicesAndAttributes = Array.from(new Set([
      services_attributes,
      ...structuredAttributeLines
    ].map((value) => value.trim()).filter(Boolean))).join(" \xB7 ");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 120));
    clickByText(/^See photos$|^Ver fotos$|^Ver todas as fotos$|^Fotos$/i);
    await new Promise((resolve) => setTimeout(resolve, 220));
    const findGalleryContainer = () => {
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog) {
        const scrollables = [dialog, ...Array.from(dialog.querySelectorAll("*"))].filter((element) => element.scrollHeight > element.clientHeight + 80 && element.clientHeight > 100).sort((a, b) => a.clientHeight - b.clientHeight);
        return scrollables[0] || dialog;
      }
      const galleryImage = Array.from(document.querySelectorAll('div[role="main"] img[src*="googleusercontent.com"]')).find((image) => image.naturalWidth > 64 && image.naturalHeight > 64);
      let parent = galleryImage?.parentElement;
      while (parent && parent !== document.body) {
        if (parent.scrollHeight > parent.clientHeight + 80 && parent.clientHeight > 100) return parent;
        parent = parent.parentElement;
      }
      return null;
    };
    let galleryContainer = findGalleryContainer();
    let previousGalleryCount = -1;
    let galleryStagnant = 0;
    for (let iteration = 0; iteration < 80; iteration++) {
      const before = photoUrls.length;
      document.querySelectorAll('[role="dialog"] img, div[role="main"] img[src*="googleusercontent.com"]').forEach((node) => {
        const image = node;
        addPhoto(image.currentSrc || image.src || attr(node, "src"));
        addPhoto(attr(node, "data-src"));
        const srcset = attr(node, "srcset");
        if (srcset) srcset.split(",").forEach((part) => addPhoto(part.trim().split(/\s+/)[0]));
      });
      document.querySelectorAll('[role="dialog"] video, [role="dialog"] [data-video-url], [role="dialog"] button[aria-label*="video"], [role="dialog"] button[aria-label*="v\xEDdeo"]').forEach((node) => {
        const media = node;
        const source = media.currentSrc || media.src || attr(node, "src") || attr(node, "data-video-url");
        const label = attr(node, "aria-label") || node.innerText || "V\xEDdeo na galeria do Google Maps";
        if (source.startsWith("http") && !seenVideos.has(source)) {
          seenVideos.add(source);
          videoUrls.push(source);
        } else if (!source && !seenVideos.has(label)) {
          seenVideos.add(label);
          videoUrls.push(label);
        }
      });
      if (photoUrls.length === previousGalleryCount && photoUrls.length === before) galleryStagnant += 1;
      else galleryStagnant = 0;
      if (galleryStagnant >= 6) break;
      previousGalleryCount = photoUrls.length;
      galleryContainer = findGalleryContainer() || galleryContainer;
      if (galleryContainer) galleryContainer.scrollTop = galleryContainer.scrollHeight;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    const makeThumbnailUrl = (url) => {
      if (/=w\d+-h\d+[^&]*/i.test(url)) return url.replace(/=w\d+-h\d+[^&]*/i, "=w400-h300-k-no");
      if (/=s\d+([^&]*)$/i.test(url)) return url.replace(/=s\d+([^&]*)$/i, "=w400-h300-k-no$1");
      if (/=w\d+([^&]*)$/i.test(url)) return url.replace(/=w\d+([^&]*)$/i, "=w400-h300-k-no$1");
      return "";
    };
    const visiblePhotoCountText = Array.from(document.querySelectorAll("button,[aria-label],span,div")).map((node) => [text(node), attr(node, "aria-label")].filter(Boolean).join(" ")).filter((value) => /\b\d{1,4}\s*(?:photos|fotos)\b/i.test(value) && value.length < 160).map((value) => value.match(/\b(\d{1,4})\s*(?:photos|fotos)\b/i)?.[1] || "").find(Boolean) || "";
    const media_items = [
      ...photoUrls.map((url) => ({
        type: "image",
        url,
        thumbnail_url: makeThumbnailUrl(url),
        title: ""
      }))
    ];
    const plusCodeNode = Array.from(document.querySelectorAll('[aria-label*="Plus code"],[aria-label*="Plus Code"],[data-item-id*="oloc"]')).find((node) => /plus code/i.test(node.getAttribute("aria-label") || ""));
    const plus_code = plusCodeNode?.getAttribute("aria-label")?.replace(/^plus code:\s*/i, "") || "";
    const popularTimesNodes = Array.from(document.querySelectorAll(
      '[aria-label*="Popular times"],[aria-label*="Hor\xE1rios de pico"],[aria-label*="Hor\xE1rios populares"],[data-day-of-week],[class*="popular-times"],[class*="PopularTimes"]'
    ));
    const popular_times = popularTimesNodes.map((node) => ({
      label: attr(node, "aria-label"),
      text: text(node).replace(/\s+/g, " ").trim(),
      day: attr(node, "data-day-of-week"),
      value: attr(node, "aria-valuenow") || attr(node, "data-value") || ""
    })).filter((item) => item.label || item.text || item.day || item.value).filter((item) => (item.label + " " + item.text).length < 600).slice(0, 300);
    const rating_distribution = {};
    document.querySelectorAll("[aria-label]").forEach((node) => {
      const label = attr(node, "aria-label").replace(/\s+/g, " ").trim();
      const match = label.match(/([1-5])\s*(?:star|stars|estrela|estrelas)\D{0,24}(\d[\d.,\s]*)/i) || label.match(/(\d[\d.,\s]*)\s*(?:reviews?|avaliações?)\D{0,24}([1-5])\s*(?:star|stars|estrela|estrelas)/i);
      if (!match) return;
      const starsFirst = /star|estrela/i.test(label.slice(0, label.indexOf(match[0]) + match[0].length).split(match[2] || match[1])[0]);
      const stars = starsFirst ? match[1] : match[2];
      const countText = starsFirst ? match[2] : match[1];
      const count = Number(countText.replace(/[.,\s]/g, ""));
      if (stars && Number.isFinite(count)) rating_distribution[String(stars)] = count;
    });
    const review_highlights = Array.from(document.querySelectorAll(
      '[data-review-summary], [class*="reviewSummary"], [class*="ReviewSummary"], [aria-label*="Review summary"], [aria-label*="Resumo das avalia\xE7\xF5es"]'
    )).map((node) => (text(node) || attr(node, "aria-label")).replace(/\s+/g, " ").trim()).filter((value) => value.length > 12 && value.length < 500).filter((value, index, all) => all.indexOf(value) === index).slice(0, 30);
    let logo_url = "";
    const businessProfileImage = Array.from(document.querySelectorAll('button[aria-label^="Photo of"] img')).find((img) => {
      const label = img.parentElement?.getAttribute("aria-label") || img.closest("button")?.getAttribute("aria-label") || "";
      return !!name && label.toLowerCase().includes(name.toLowerCase());
    });
    if (businessProfileImage) {
      const source = businessProfileImage.currentSrc || businessProfileImage.src || "";
      if (source.startsWith("http") && !/w\d{1,2}-h\d{1,2}|br100|avatar/i.test(source)) logo_url = source;
    }
    for (const selector of selectors.logo) {
      try {
        const el = document.querySelector(selector);
        const src = el?.currentSrc || el?.src || "";
        if (src.startsWith("http") && !src.includes("cleardot.gif") && /logo|avatar|profile|perfil/i.test((el?.alt || "") + " " + (el?.getAttribute("aria-label") || ""))) {
          logo_url = src;
          break;
        }
      } catch {
      }
    }
    videoUrls.forEach((url) => media_items.push({ type: "video", url, thumbnail_url: "", title: "" }));
    return {
      name,
      category,
      rating,
      review_count,
      price_range,
      address: address2,
      website,
      phone,
      opening_hours,
      business_status: statusText,
      description,
      services_attributes: servicesAndAttributes,
      photos: photoUrls.join(" | "),
      videos: videoUrls.join(" | "),
      logo_url,
      social_links: socialUrls.join(" | "),
      bookingUrl,
      reviews,
      review_topics,
      additional_attributes,
      media_items,
      plus_code,
      popular_times,
      rating_distribution,
      review_highlights,
      attributes,
      accessibility_attributes,
      nextOpeningText,
      nextOpeningDay: openingDayMatch?.[1] || "",
      nextOpeningTime: openingTimeMatch?.[1] || "",
      visiblePhotosCount: visiblePhotoCountText,
      currentUrl: window.location.href
    };
  }, SELECTORS.place);
  const finalUrl = raw.currentUrl || targetUrl;
  const coords = extractCoordinates(finalUrl);
  const address = normalizeAddress(raw.address);
  const addressComponents = parseAddressComponents(address);
  const sourcePlaceId = extractSourcePlaceId(finalUrl);
  const sourceUrl = targetUrl || finalUrl;
  const fieldValues = {
    name: raw.name,
    category: raw.category,
    address,
    phone: raw.phone,
    website: raw.website,
    rating: raw.rating,
    review_count: raw.review_count,
    price_range: raw.price_range,
    opening_hours: raw.opening_hours,
    business_status: raw.business_status,
    booking_url: raw.bookingUrl,
    photos: raw.photos,
    videos: raw.videos,
    logo_url: raw.logo_url,
    social_links: raw.social_links,
    reviews: raw.reviews,
    review_topics: raw.review_topics,
    additional_attributes: raw.additional_attributes,
    media_items: raw.media_items,
    plus_code: raw.plus_code,
    attributes: raw.attributes,
    accessibility_attributes: raw.accessibility_attributes,
    next_opening_text: raw.nextOpeningText,
    next_open_day: raw.nextOpeningDay,
    next_open_time: raw.nextOpeningTime,
    visible_photos_count: raw.visiblePhotosCount,
    popular_times: raw.popular_times,
    rating_distribution: raw.rating_distribution,
    review_highlights: raw.review_highlights,
    postal_code: addressComponents.postal_code,
    country: addressComponents.country,
    city: addressComponents.city,
    state: addressComponents.state,
    source_place_id: sourcePlaceId,
    source_url: sourceUrl
  };
  const fieldStatus = Object.fromEntries(Object.entries(fieldValues).map(([field, value]) => {
    const present = Array.isArray(value) ? value.length > 0 : value && typeof value === "object" ? Object.keys(value).length > 0 : String(value ?? "").trim().length > 0;
    return [field, { status: present ? "captured" : "not_observed_in_session", observed_at: (/* @__PURE__ */ new Date()).toISOString() }];
  }));
  return {
    id: `place_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    job_id: jobId,
    name: cleanText(raw.name),
    category: normalizeCategory(raw.category),
    address,
    phone: normalizePhone(raw.phone),
    website: normalizeWebsite(raw.website),
    rating: normalizeRating(raw.rating),
    review_count: normalizeReviewCount(raw.review_count),
    price_range: normalizePriceRange(raw.price_range),
    opening_hours: cleanText(raw.opening_hours),
    business_status: normalizeBusinessStatus(raw.business_status),
    latitude: coords.latitude,
    longitude: coords.longitude,
    maps_url: finalUrl,
    description: cleanText(raw.description),
    services_attributes: cleanText(raw.services_attributes),
    photos: cleanText(raw.photos),
    videos: cleanText(raw.videos),
    logo_url: cleanText(raw.logo_url),
    social_links: cleanText(raw.social_links),
    reviews: JSON.stringify(Array.isArray(raw.reviews) ? raw.reviews : []),
    review_topics: JSON.stringify(Array.isArray(raw.review_topics) ? raw.review_topics : []),
    additional_attributes: JSON.stringify(raw.additional_attributes || {}),
    media_items: JSON.stringify(Array.isArray(raw.media_items) ? raw.media_items : []),
    plus_code: cleanText(raw.plus_code),
    attributes: JSON.stringify(Array.isArray(raw.attributes) ? raw.attributes : []),
    accessibility_attributes: JSON.stringify(Array.isArray(raw.accessibility_attributes) ? raw.accessibility_attributes : []),
    next_opening_text: cleanText(raw.nextOpeningText),
    next_open_day: cleanText(raw.nextOpeningDay),
    next_open_time: cleanText(raw.nextOpeningTime),
    visible_photos_count: cleanText(raw.visiblePhotosCount),
    postal_code: cleanText(addressComponents.postal_code),
    country: cleanText(addressComponents.country),
    city: cleanText(addressComponents.city),
    state: cleanText(addressComponents.state),
    source_place_id: cleanText(sourcePlaceId),
    source_url: cleanText(sourceUrl),
    popular_times: JSON.stringify(Array.isArray(raw.popular_times) ? raw.popular_times : []),
    rating_distribution: JSON.stringify(raw.rating_distribution || {}),
    review_highlights: JSON.stringify(Array.isArray(raw.review_highlights) ? raw.review_highlights : []),
    field_status: JSON.stringify(fieldStatus),
    collected_at: (/* @__PURE__ */ new Date()).toISOString(),
    booking_url: cleanText(raw.bookingUrl)
  };
}

// src/server/scraper/runner.ts
var activeJobs = /* @__PURE__ */ new Map();
async function safeAudit(input) {
  try {
    await writeAuditLog(input);
  } catch {
  }
}
async function connectScraperBrowser() {
  if (process.env.VERCEL) {
    const { getBrowserWSEndpoint: getBrowserWSEndpoint2, getBrowserEndpointDiagnostic: getBrowserEndpointDiagnostic2 } = await Promise.resolve().then(() => (init_browserless_endpoint(), browserless_endpoint_exports));
    const endpoint = getBrowserWSEndpoint2();
    try {
      return await puppeteer2.connect({ browserWSEndpoint: endpoint, protocolTimeout: 6e4 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "falha desconhecida";
      throw new Error(`Falha ao conectar ao Chromium remoto. Diagn\xF3stico seguro do endpoint: ${JSON.stringify(getBrowserEndpointDiagnostic2(endpoint))}. Erro Puppeteer: ${message}`);
    }
  }
  return puppeteer2.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--lang=pt-BR,pt"]
  });
}
function isTransientBrowserError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /connection closed|target closed|detached frame|session closed|websocket is not open|protocol error|browser has disconnected|cannot find context/i.test(message);
}
function isBrowserConnected(browser) {
  const compatible = browser;
  if (typeof compatible.isConnected === "function") return compatible.isConnected();
  return compatible.connected !== false;
}
function missingFields2(place) {
  const fields = ["name", "category", "address", "phone", "website", "rating", "review_count", "price_range", "opening_hours", "business_status", "latitude", "longitude", "maps_url", "description", "services_attributes", "photos", "videos", "logo_url", "booking_url", "social_links", "reviews", "review_topics", "additional_attributes", "media_items", "plus_code", "attributes", "accessibility_attributes", "next_opening_text", "next_open_day", "next_open_time", "visible_photos_count", "postal_code", "country", "city", "state", "source_place_id", "source_url", "popular_times", "rating_distribution", "review_highlights", "field_status", "collected_at"];
  return fields.filter((field) => {
    const value = String(place[field] ?? "").trim();
    if (!value) return true;
    if (field === "reviews" || field === "review_topics" || field === "media_items") {
      try {
        const parsed = JSON.parse(value);
        return !Array.isArray(parsed) || parsed.length === 0;
      } catch {
        return true;
      }
    }
    if (field === "additional_attributes") {
      try {
        const parsed = JSON.parse(value);
        return !parsed.about_text?.trim() && !parsed.sections?.length && !parsed.labeled_attributes?.length;
      } catch {
        return true;
      }
    }
    return false;
  });
}
var ENRICHMENT_FIELDS = [
  "review_count",
  "opening_hours",
  "booking_url",
  "reviews",
  "review_topics",
  "additional_attributes",
  "media_items",
  "popular_times",
  "rating_distribution",
  "review_highlights",
  "attributes",
  "accessibility_attributes",
  "next_opening_text",
  "next_open_day",
  "next_open_time",
  "visible_photos_count",
  "postal_code",
  "country",
  "city",
  "state",
  "source_place_id"
];
function needsEnrichment(place) {
  const missing = missingFields2(place);
  return ENRICHMENT_FIELDS.some((field) => missing.includes(field));
}
function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function mergeDelimited(oldValue, newValue) {
  return Array.from(new Set([...(oldValue || "").split(" | "), ...(newValue || "").split(" | ")].map((value) => value.trim()).filter(Boolean))).join(" | ");
}
function mergePlaceRecords(existing, fresh) {
  const freshReviews = parseJsonArray(fresh.reviews);
  const oldReviews = parseJsonArray(existing.reviews);
  const freshTopics = parseJsonArray(fresh.review_topics);
  const oldTopics = parseJsonArray(existing.review_topics);
  const freshMedia = parseJsonArray(fresh.media_items);
  const oldMedia = parseJsonArray(existing.media_items);
  const freshAttributes = parseJsonObject(fresh.additional_attributes);
  const oldAttributes = parseJsonObject(existing.additional_attributes);
  const hasFreshAttributes = Boolean(freshAttributes.about_text?.trim() || freshAttributes.sections?.length || freshAttributes.labeled_attributes?.length);
  const freshPopularTimes = parseJsonArray(fresh.popular_times);
  const oldPopularTimes = parseJsonArray(existing.popular_times);
  const freshRatingDistribution = parseJsonObject(fresh.rating_distribution);
  const oldRatingDistribution = parseJsonObject(existing.rating_distribution);
  const freshHighlights = parseJsonArray(fresh.review_highlights);
  const oldHighlights = parseJsonArray(existing.review_highlights);
  const freshAttributesList = parseJsonArray(fresh.attributes);
  const oldAttributesList = parseJsonArray(existing.attributes);
  const freshAccessibility = parseJsonArray(fresh.accessibility_attributes);
  const oldAccessibility = parseJsonArray(existing.accessibility_attributes);
  const freshFieldStatus = parseJsonObject(fresh.field_status);
  const oldFieldStatus = parseJsonObject(existing.field_status);
  return {
    ...existing,
    ...fresh,
    id: existing.id,
    job_id: existing.job_id,
    name: fresh.name || existing.name,
    category: fresh.category || existing.category,
    address: fresh.address || existing.address,
    phone: fresh.phone || existing.phone,
    website: fresh.website || existing.website,
    rating: fresh.rating || existing.rating,
    review_count: fresh.review_count || existing.review_count,
    price_range: fresh.price_range || existing.price_range,
    opening_hours: fresh.opening_hours || existing.opening_hours,
    business_status: fresh.business_status || existing.business_status,
    latitude: fresh.latitude || existing.latitude,
    longitude: fresh.longitude || existing.longitude,
    maps_url: fresh.maps_url || existing.maps_url,
    description: fresh.description || existing.description,
    services_attributes: fresh.services_attributes || existing.services_attributes,
    photos: mergeDelimited(existing.photos, fresh.photos),
    videos: mergeDelimited(existing.videos, fresh.videos),
    logo_url: fresh.logo_url || existing.logo_url,
    booking_url: fresh.booking_url || existing.booking_url || "",
    social_links: mergeDelimited(existing.social_links, fresh.social_links),
    reviews: JSON.stringify(freshReviews.length ? freshReviews : oldReviews),
    review_topics: JSON.stringify(freshTopics.length ? freshTopics : oldTopics),
    additional_attributes: JSON.stringify(hasFreshAttributes ? freshAttributes : oldAttributes),
    media_items: JSON.stringify(Array.from(
      new Map([...oldMedia, ...freshMedia].filter((item) => item && typeof item === "object").map((item) => [String(item.type || "") + ":" + String(item.url || item.title || ""), item])).values()
    )),
    plus_code: fresh.plus_code || existing.plus_code,
    attributes: JSON.stringify(freshAttributesList.length ? freshAttributesList : oldAttributesList),
    accessibility_attributes: JSON.stringify(freshAccessibility.length ? freshAccessibility : oldAccessibility),
    next_opening_text: fresh.next_opening_text || existing.next_opening_text || "",
    next_open_day: fresh.next_open_day || existing.next_open_day || "",
    next_open_time: fresh.next_open_time || existing.next_open_time || "",
    visible_photos_count: fresh.visible_photos_count || existing.visible_photos_count || "",
    postal_code: fresh.postal_code || existing.postal_code || "",
    country: fresh.country || existing.country || "",
    city: fresh.city || existing.city || "",
    state: fresh.state || existing.state || "",
    source_place_id: fresh.source_place_id || existing.source_place_id || "",
    source_url: fresh.source_url || existing.source_url || fresh.maps_url || existing.maps_url,
    popular_times: JSON.stringify(freshPopularTimes.length ? freshPopularTimes : oldPopularTimes),
    rating_distribution: JSON.stringify(Object.keys(freshRatingDistribution).length ? freshRatingDistribution : oldRatingDistribution),
    review_highlights: JSON.stringify(freshHighlights.length ? freshHighlights : oldHighlights),
    field_status: JSON.stringify({ ...oldFieldStatus, ...freshFieldStatus }),
    collected_at: fresh.collected_at || existing.collected_at || (/* @__PURE__ */ new Date()).toISOString()
  };
}
function isJobRunning(jobId) {
  return activeJobs.has(jobId);
}
function stopScrapeJob(jobId) {
  const handle = activeJobs.get(jobId);
  if (handle) {
    handle.cancelled = true;
    handle.cancel();
    return true;
  }
  return false;
}
async function runScraperJob(jobId, segment, location, limitRequested, onProgress) {
  const handle = {
    cancelled: false,
    cancel: () => {
      handle.cancelled = true;
    }
  };
  activeJobs.set(jobId, handle);
  let browser = null;
  const connectAndTrackBrowser = async () => {
    const connectedBrowser = await connectScraperBrowser();
    browser = connectedBrowser;
    connectedBrowser.on("disconnected", () => {
      if (browser === connectedBrowser) browser = null;
    });
    return connectedBrowser;
  };
  let totalFound = 0;
  let totalCollected = 0;
  let totalDuplicates = 0;
  let totalErrors = 0;
  let baselineCount = 0;
  let consumerProject;
  const emitProgress = async (step, updates = {}) => {
    const jobUpdates = {
      current_step: step,
      total_found: totalFound,
      total_collected: totalCollected,
      total_duplicates: totalDuplicates,
      total_errors: totalErrors,
      ...updates
    };
    try {
      await updateJobProgress(jobId, jobUpdates);
      if (onProgress) {
        const current = await getJob(jobId);
        if (current) onProgress(current);
      }
    } catch (progressError) {
      console.error("Falha ao atualizar progresso; a coleta continuar\xE1:", progressError instanceof Error ? progressError.message : progressError);
      await safeAudit({
        level: "error",
        category: "scraper",
        event: "job.progress_update_failed",
        message: progressError instanceof Error ? progressError.message : "Falha ao persistir progresso.",
        jobId,
        metadata: { step: step.slice(0, 200), status: updates.status || "running" }
      });
    }
  };
  try {
    const owningJob = await getJob(jobId);
    if (!owningJob) throw new Error("Coleta n\xE3o encontrada no banco antes da execu\xE7\xE3o.");
    consumerProject = owningJob.user_id;
    baselineCount = await countPlaces();
    await safeAudit({ category: "scraper", event: "job.browser_start", message: "Inicializando Chromium.", jobId, metadata: { segment, location, limitRequested, databaseCountBefore: baselineCount } });
    await emitProgress("Iniciando navegador Chromium...", { status: "running" });
    await connectAndTrackBrowser();
    handle.cancel = () => {
      handle.cancelled = true;
      if (browser) {
        browser.close().catch(() => {
        });
      }
    };
    if (handle.cancelled) {
      await emitProgress("Coleta cancelada antes de iniciar navega\xE7\xE3o.", {
        status: "stopped",
        status_message: "Coleta interrompida pelo usu\xE1rio.",
        completed_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      return;
    }
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      window.__name = (f) => f;
      globalThis.__name = (f) => f;
    });
    await page.emulateLocale("pt-BR");
    await page.emulateTimezone("America/Sao_Paulo");
    await page.setExtraHTTPHeaders({ "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8" });
    await page.setViewport({ width: 1366, height: 768 });
    const fullQuery = `${segment.trim()} ${location.trim()}`.trim();
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(fullQuery)}?hl=pt-BR`;
    await emitProgress(`Navegando no Google Maps para: "${fullQuery}"...`);
    try {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 35e3 });
      await page.waitForSelector('div[role="feed"], a[href*="/maps/place/"], div.Nv2PK', { timeout: 2e4 }).catch(() => {
      });
      await new Promise((resolve) => setTimeout(resolve, 1200));
    } catch (err) {
      throw new Error(`Falha ao carregar p\xE1gina de pesquisa do Google Maps: ${err.message}`);
    }
    if (handle.cancelled) {
      await emitProgress("Coleta interrompida pelo usu\xE1rio.", {
        status: "stopped",
        status_message: "Coleta interrompida pelo usu\xE1rio.",
        completed_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      return;
    }
    const isBlocked = await page.evaluate(() => {
      const text = document.body.innerText || "";
      return text.includes("tr\xE1fego incomum") || text.includes("unusual traffic") || document.querySelector('iframe[src*="recaptcha"]') !== null || document.querySelector("#captcha-form") !== null;
    });
    if (isBlocked) {
      await safeAudit({ level: "error", category: "scraper", event: "maps.access_challenge", message: "Google Maps exibiu verifica\xE7\xE3o ou bloqueio; a coleta foi interrompida.", jobId, metadata: { pageUrl: page.url() } });
      await emitProgress("Bloqueio ou verifica\xE7\xE3o detectada no Google Maps.", {
        status: "failed",
        status_message: "Google Maps exigiu verifica\xE7\xE3o de tr\xE1fego. Coleta interrompida para cumprir regras de acesso.",
        completed_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      return;
    }
    const currentUrl = page.url();
    if (currentUrl.includes("/maps/place/")) {
      await emitProgress("Resultado exato identificado. Coletando ficha...");
      totalFound = 1;
      const placeRecord = await extractPlaceDetails(page, jobId, currentUrl);
      if (!placeRecord.name.trim()) {
        throw new Error("A ficha direta abriu sem nome identific\xE1vel; registro n\xE3o salvo.");
      }
      if (!placeRecord.maps_url.includes("/maps/place/")) {
        placeRecord.maps_url = currentUrl;
      }
      const existingDirectPlace = await findPlaceByUrl(currentUrl, consumerProject);
      if (existingDirectPlace) {
        if (needsEnrichment(existingDirectPlace)) {
          const merged = mergePlaceRecords(existingDirectPlace, placeRecord);
          await updatePlace(existingDirectPlace.id, merged);
          totalCollected = 1;
          await safeAudit({
            category: "scraper",
            event: "place.enriched",
            message: "Ficha direta existente atualizada com campos p\xFAblicos adicionais.",
            jobId,
            metadata: { placeId: existingDirectPlace.id, name: merged.name, reviewsCaptured: parseJsonArray(placeRecord.reviews).length, topicsCaptured: parseJsonArray(placeRecord.review_topics).length, mediaCaptured: parseJsonArray(placeRecord.media_items).length, missingFields: missingFields2(merged) }
          });
        } else {
          totalDuplicates = 1;
          await safeAudit({
            category: "scraper",
            event: "place.duplicate_skipped",
            message: "Ficha direta j\xE1 existe e os campos de enriquecimento est\xE3o preenchidos; ignorada.",
            jobId,
            metadata: { mapsUrl: currentUrl, previewName: placeRecord.name, existingPlaceId: existingDirectPlace.id, existingName: existingDirectPlace.name, existingJobId: existingDirectPlace.job_id, existingCollectedAt: existingDirectPlace.collected_at, reason: "duplicate_already_enriched" }
          });
        }
      } else {
        await insertPlace(placeRecord);
        totalCollected = 1;
        await safeAudit({ category: "scraper", event: "place.saved", message: "Ficha salva no SQLite.", jobId, metadata: { placeId: placeRecord.id, name: placeRecord.name, mapsUrl: placeRecord.maps_url, missingFields: missingFields2(placeRecord) } });
      }
      const directStatus = totalCollected === 0 && totalDuplicates > 0 ? "partial" : "completed";
      const directMessage = totalCollected === 1 ? "Coleta conclu\xEDda com sucesso (resultado \xFAnico direto)." : "A ficha encontrada j\xE1 estava salva. Nenhum dado novo foi adicionado \xE0 base.";
      await safeAudit({ level: directStatus === "partial" ? "warn" : "info", category: "scraper", event: "job.finished", message: directMessage, jobId, metadata: { status: directStatus, totalFound, totalCollected, totalDuplicates, totalErrors, databaseCountBefore: baselineCount } });
      await emitProgress("Coleta finalizada.", {
        status: directStatus,
        status_message: totalCollected === 1 ? "Coleta conclu\xEDda com sucesso (resultado \xFAnico direto)." : "A ficha encontrada j\xE1 estava salva. Nenhum dado novo foi adicionado \xE0 base.",
        completed_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      return;
    }
    await emitProgress("Localizando lista de estabelecimentos...");
    try {
      await page.waitForSelector('div[role="feed"], a[href*="/maps/place/"], div.Nv2PK', {
        timeout: 15e3
      });
    } catch {
      const pageText = await page.evaluate(() => document.body.innerText);
      if (pageText.includes("Nenhum resultado encontrado") || pageText.includes("n\xE3o encontrou")) {
        await emitProgress("Nenhum estabelecimento encontrado para a pesquisa informada.", {
          status: "completed",
          status_message: "Nenhum resultado encontrado no Google Maps para o termo informado.",
          completed_at: (/* @__PURE__ */ new Date()).toISOString()
        });
        return;
      }
    }
    await emitProgress("Carregando resultados da lista...");
    const discoveredUrls = [];
    const seenUrlsInRun = /* @__PURE__ */ new Set();
    const eligibleUrlsInRun = /* @__PURE__ */ new Set();
    const retriedItems = /* @__PURE__ */ new Set();
    let duplicateUrlsDiscovered = 0;
    const resumeRecord = await getLastCollectedPlaceForSearch(segment, location, consumerProject);
    const resumeUrl = resumeRecord?.maps_url ? resumeRecord.maps_url.split("?")[0].replace(/\/$/, "") : "";
    let resumeReached = !resumeUrl;
    let resumeFallbackUsed = false;
    let scrollAttempts = 0;
    let stagnantRounds = 0;
    let reachedEndOfList = false;
    const maxScrollAttempts = Math.min(Math.max(limitRequested * 4, 40), 160);
    while (eligibleUrlsInRun.size < limitRequested && scrollAttempts < maxScrollAttempts && stagnantRounds < 8 && !handle.cancelled) {
      scrollAttempts++;
      if (!resumeReached && scrollAttempts >= Math.min(maxScrollAttempts, 40)) {
        resumeReached = true;
        resumeFallbackUsed = true;
        stagnantRounds = 0;
        await safeAudit({
          level: "warn",
          category: "scraper",
          event: "results.resume_checkpoint_missing",
          message: "O checkpoint salvo n\xE3o reapareceu ap\xF3s 40 rolagens; continuando com deduplica\xE7\xE3o no banco sem consumir limite com fichas j\xE1 existentes.",
          jobId,
          metadata: { checkpointUrl: resumeUrl, scrollAttempts }
        });
      }
      const currentLinks = await page.evaluate((selectors) => {
        const links = [];
        try {
          const items = document.querySelectorAll(selectors.placeLinks.join(", "));
          items.forEach((item) => {
            const a = item;
            const href = a.href;
            if (href && href.includes("/maps/place/")) {
              const previewName = a.getAttribute("aria-label") || a.innerText.trim() || "";
              links.push({ url: href, previewName });
            }
          });
        } catch {
          const anchors = document.querySelectorAll('a[href*="/maps/place/"]');
          anchors.forEach((a) => {
            const el = a;
            links.push({
              url: el.href,
              previewName: el.getAttribute("aria-label") || el.innerText.trim() || ""
            });
          });
        }
        return links;
      }, SELECTORS.feed);
      let newFoundInBatch = 0;
      let newUniqueLinksInBatch = 0;
      for (const item of currentLinks) {
        const canonicalUrl = item.url.split("?")[0].replace(/\/$/, "");
        if (!canonicalUrl || seenUrlsInRun.has(canonicalUrl) || eligibleUrlsInRun.has(canonicalUrl)) continue;
        seenUrlsInRun.add(canonicalUrl);
        newUniqueLinksInBatch++;
        if (!resumeReached) {
          if (canonicalUrl === resumeUrl) {
            resumeReached = true;
            await safeAudit({
              category: "scraper",
              event: "results.resume_checkpoint_reached",
              message: "Retomada alcan\xE7ou a \xFAltima ficha salva para esta pesquisa.",
              jobId,
              metadata: { checkpointUrl: resumeUrl, checkpointName: resumeRecord?.name || "", scrollAttempt: scrollAttempts }
            });
          }
          continue;
        }
        if (eligibleUrlsInRun.size >= limitRequested) continue;
        const existingPlace = await findPlaceByUrl(canonicalUrl, consumerProject);
        if (existingPlace) {
          if (needsEnrichment(existingPlace)) {
            eligibleUrlsInRun.add(canonicalUrl);
            discoveredUrls.push({ ...item, url: canonicalUrl, previewName: existingPlace.name || item.previewName });
            newFoundInBatch++;
            await safeAudit({
              category: "scraper",
              event: "place.enrichment_candidate",
              message: "Ficha existente tem campos de avalia\xE7\xE3o/m\xEDdia incompletos; ser\xE1 reprocessada.",
              jobId,
              metadata: { mapsUrl: canonicalUrl, existingPlaceId: existingPlace.id, existingName: existingPlace.name, missingFields: missingFields2(existingPlace) }
            });
            continue;
          }
          totalDuplicates++;
          duplicateUrlsDiscovered++;
          await safeAudit({
            category: "scraper",
            event: "place.duplicate_skipped",
            message: "Ficha j\xE1 existe e os campos de enriquecimento est\xE3o preenchidos; ignorada durante a descoberta.",
            jobId,
            metadata: { mapsUrl: canonicalUrl, previewName: item.previewName || "", existingPlaceId: existingPlace.id, existingName: existingPlace.name, existingJobId: existingPlace.job_id, existingCollectedAt: existingPlace.collected_at, reason: "duplicate_already_enriched" }
          });
          continue;
        }
        eligibleUrlsInRun.add(canonicalUrl);
        discoveredUrls.push({ ...item, url: canonicalUrl });
        newFoundInBatch++;
      }
      totalFound = eligibleUrlsInRun.size;
      if (newFoundInBatch > 0) await safeAudit({ category: "scraper", event: "results.discovered", message: "Novas fichas candidatas encontradas na lista.", jobId, metadata: { totalFound, newCandidates: discoveredUrls.length, newInBatch: newFoundInBatch, duplicatesSeen: duplicateUrlsDiscovered, scrollAttempt: scrollAttempts } });
      await emitProgress(`Limite: ${limitRequested} fichas. Avaliadas ${totalFound}; eleg\xEDveis para extra\xE7\xE3o ${discoveredUrls.length}; duplicados ${duplicateUrlsDiscovered}.`);
      if (eligibleUrlsInRun.size >= limitRequested) {
        break;
      }
      const isEndOfList = await page.evaluate((selectors) => {
        for (const sel of selectors.endOfList) {
          try {
            if (document.querySelector(sel)) return true;
          } catch {
          }
        }
        const text = document.body ? document.body.innerText : "";
        if (text.includes("Voc\xEA chegou ao final da lista") || text.includes("fim da lista")) {
          return true;
        }
        return false;
      }, SELECTORS.feed);
      if (resumeReached) {
        if (newUniqueLinksInBatch === 0) stagnantRounds++;
        else stagnantRounds = 0;
      } else if (newUniqueLinksInBatch > 0) {
        stagnantRounds = 0;
      }
      if (isEndOfList && newUniqueLinksInBatch === 0) {
        if (!resumeReached) {
          resumeReached = true;
          resumeFallbackUsed = true;
          seenUrlsInRun.clear();
          stagnantRounds = 0;
          await safeAudit({
            level: "warn",
            category: "scraper",
            event: "results.resume_checkpoint_missing",
            message: "A lista terminou antes de reencontrar o ponto salvo; reavaliando resultados com deduplica\xE7\xE3o global.",
            jobId,
            metadata: { checkpointUrl: resumeUrl, scrollAttempts }
          });
          continue;
        }
        reachedEndOfList = true;
        break;
      }
      const scrollTarget = await page.evaluate(() => {
        const feed = document.querySelector('div[role="feed"]');
        if (!feed) return null;
        feed.scrollIntoView({ block: "nearest" });
        const candidates = [feed, ...Array.from(feed.querySelectorAll("*"))];
        const scrollable = candidates.filter((el) => el.clientHeight > 100 && el.scrollHeight > el.clientHeight + 20).sort((a, b) => {
          const aCanScroll = a.scrollTop < a.scrollHeight - a.clientHeight - 2 ? 1 : 0;
          const bCanScroll = b.scrollTop < b.scrollHeight - b.clientHeight - 2 ? 1 : 0;
          if (aCanScroll !== bCanScroll) return bCanScroll - aCanScroll;
          return b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight);
        });
        const target = scrollable[0] || feed;
        const rect = target.getBoundingClientRect();
        return {
          x: Math.max(5, Math.min(window.innerWidth - 5, rect.left + rect.width / 2)),
          y: Math.max(5, Math.min(window.innerHeight - 5, rect.top + Math.min(rect.height / 2, 300))),
          beforeTop: target.scrollTop,
          maxTop: Math.max(0, target.scrollHeight - target.clientHeight),
          tag: target.tagName,
          className: String(target.className || "").slice(0, 120),
          feedLinks: feed.querySelectorAll('a[href*="/maps/place/"]').length
        };
      });
      let scrollMoved = false;
      if (scrollTarget) {
        await page.mouse.move(scrollTarget.x, scrollTarget.y);
        await page.mouse.wheel({ deltaY: resumeReached ? 650 : 1300 });
        await new Promise((resolve) => setTimeout(resolve, 350));
        const wheelMoved = await page.evaluate((beforeTop) => {
          const feed = document.querySelector('div[role="feed"]');
          if (!feed) return false;
          const candidates = [feed, ...Array.from(feed.querySelectorAll("*"))];
          const target = candidates.filter((el) => el.clientHeight > 100 && el.scrollHeight > el.clientHeight + 20).sort((a, b) => {
            const aCanScroll = a.scrollTop < a.scrollHeight - a.clientHeight - 2 ? 1 : 0;
            const bCanScroll = b.scrollTop < b.scrollHeight - b.clientHeight - 2 ? 1 : 0;
            if (aCanScroll !== bCanScroll) return bCanScroll - aCanScroll;
            return b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight);
          })[0] || feed;
          return Math.abs(target.scrollTop - beforeTop) > 2;
        }, scrollTarget.beforeTop);
        scrollMoved = wheelMoved;
        if (!scrollMoved) {
          await page.evaluate(() => {
            const feed = document.querySelector('div[role="feed"]');
            if (!feed) {
              window.scrollBy({ top: 650, behavior: "auto" });
              return;
            }
            const candidates = [feed, ...Array.from(feed.querySelectorAll("*"))];
            const target = candidates.filter((el) => el.clientHeight > 100 && el.scrollHeight > el.clientHeight + 20).sort((a, b) => {
              const aCanScroll = a.scrollTop < a.scrollHeight - a.clientHeight - 2 ? 1 : 0;
              const bCanScroll = b.scrollTop < b.scrollHeight - b.clientHeight - 2 ? 1 : 0;
              if (aCanScroll !== bCanScroll) return bCanScroll - aCanScroll;
              return b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight);
            })[0] || feed;
            target.scrollTop = Math.min(target.scrollHeight, target.scrollTop + Math.max(600, target.clientHeight * 0.8));
            target.dispatchEvent(new Event("scroll", { bubbles: true }));
          });
        }
      } else {
        await page.mouse.wheel({ deltaY: 650 });
      }
      const knownUrls = Array.from(seenUrlsInRun);
      await page.waitForFunction((known) => {
        const anchors = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
        return anchors.some((a) => {
          const url = a.href.split("?")[0].replace(/\/$/, "");
          return url && !known.includes(url);
        });
      }, { timeout: 3e3 }, knownUrls).catch(() => {
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
      const scrollEvidence = await page.evaluate(() => {
        const feed = document.querySelector('div[role="feed"]');
        const links = Array.from(document.querySelectorAll('a[href*="/maps/place/"]')).map((a) => a.href.split("?")[0].replace(/\/$/, ""));
        const unique = Array.from(new Set(links));
        const candidates = feed ? [feed, ...Array.from(feed.querySelectorAll("*"))] : [];
        const target = candidates.filter((el) => el.clientHeight > 100 && el.scrollHeight > el.clientHeight + 20).sort((a, b) => {
          const aCanScroll = a.scrollTop < a.scrollHeight - a.clientHeight - 2 ? 1 : 0;
          const bCanScroll = b.scrollTop < b.scrollHeight - b.clientHeight - 2 ? 1 : 0;
          if (aCanScroll !== bCanScroll) return bCanScroll - aCanScroll;
          return b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight);
        })[0];
        return {
          scrollTop: target?.scrollTop ?? 0,
          scrollHeight: target?.scrollHeight ?? 0,
          clientHeight: target?.clientHeight ?? 0,
          visibleUniqueLinks: unique.length,
          firstUrl: unique[0] || "",
          lastUrl: unique[unique.length - 1] || ""
        };
      });
      await safeAudit({
        level: "info",
        category: "scraper",
        event: "results.scroll",
        message: "Rolagem da lista de resultados executada e medida.",
        jobId,
        metadata: { scrollAttempt: scrollAttempts, target: scrollTarget, evidence: scrollEvidence, moved: scrollTarget ? Math.abs(scrollEvidence.scrollTop - scrollTarget.beforeTop) > 2 : scrollMoved, resumeCheckpoint: resumeUrl || null, resumeReached, resumeFallbackUsed }
      });
    }
    if (discoveredUrls.length === 0) {
      const noNewStatus = totalDuplicates > 0 ? "partial" : "completed";
      const noNewMessage = totalDuplicates > 0 ? `Nenhum dado novo foi salvo. ${totalDuplicates} fichas j\xE1 existentes foram ignoradas; a base n\xE3o cresceu nesta execu\xE7\xE3o.` : "Nenhum resultado vis\xEDvel na p\xE1gina p\xFAblica do Google Maps.";
      await safeAudit({ level: totalDuplicates > 0 ? "warn" : "info", category: "scraper", event: "job.finished", message: noNewMessage, jobId, metadata: { status: noNewStatus, totalFound, totalCollected, totalDuplicates, totalErrors, scrollAttempts, reachedEndOfList, databaseCountBefore: baselineCount } });
      await emitProgress(noNewMessage, {
        status: noNewStatus,
        status_message: noNewMessage,
        completed_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      return;
    }
    const itemsToProcess = discoveredUrls.slice(0, limitRequested);
    totalFound = Math.min(eligibleUrlsInRun.size, limitRequested);
    await emitProgress(
      `Iniciando extra\xE7\xE3o detalhada de ${itemsToProcess.length} fichas de estabelecimentos...`
    );
    for (let i = 0; i < itemsToProcess.length; i++) {
      if (handle.cancelled) {
        await emitProgress("Coleta interrompida pelo usu\xE1rio.", {
          status: "stopped",
          status_message: `Coleta interrompida pelo usu\xE1rio. ${totalCollected} estabelecimentos foram salvos no SQLite.`,
          completed_at: (/* @__PURE__ */ new Date()).toISOString()
        });
        return;
      }
      const item = itemsToProcess[i];
      const placeNum = i + 1;
      const previewTitle = item.previewName || `Estabelecimento #${placeNum}`;
      let detailPage = null;
      try {
        if (!browser || !isBrowserConnected(browser)) await connectAndTrackBrowser();
        const existingPlace = await findPlaceByUrl(item.url, consumerProject);
        if (existingPlace) {
          if (needsEnrichment(existingPlace)) {
            await emitProgress(`[${placeNum}/${itemsToProcess.length}] Atualizando ficha existente: ${existingPlace.name}...`);
            detailPage = await browser.newPage();
            await detailPage.emulateLocale("pt-BR");
            await detailPage.emulateTimezone("America/Sao_Paulo");
            await detailPage.setExtraHTTPHeaders({ "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8" });
            await detailPage.setViewport({ width: 1366, height: 768 });
            await detailPage.goto(item.url, { waitUntil: "domcontentloaded", timeout: 3e4 });
            await detailPage.waitForSelector("h1", { timeout: 12e3 }).catch(() => {
            });
            await new Promise((resolve) => setTimeout(resolve, 700));
            const fresh = await extractPlaceDetails(detailPage, jobId, item.url);
            if (!fresh.name.trim()) fresh.name = existingPlace.name || item.previewName;
            const merged = mergePlaceRecords(existingPlace, fresh);
            await updatePlace(existingPlace.id, merged);
            totalCollected++;
            await safeAudit({
              category: "scraper",
              event: "place.enriched",
              message: "Ficha existente atualizada com campos p\xFAblicos adicionais.",
              jobId,
              metadata: { placeId: existingPlace.id, name: merged.name, reviewCount: merged.review_count, reviewsCaptured: parseJsonArray(fresh.reviews).length, topicsCaptured: parseJsonArray(fresh.review_topics).length, mediaCaptured: parseJsonArray(fresh.media_items).length, missingFields: missingFields2(merged) }
            });
            await emitProgress(`[${placeNum}/${itemsToProcess.length}] Ficha enriquecida: ${merged.name}`);
            continue;
          }
          totalDuplicates++;
          await safeAudit({ category: "scraper", event: "place.duplicate_skipped", message: "Ficha j\xE1 existe e os campos de enriquecimento est\xE3o preenchidos; ignorada.", jobId, metadata: { mapsUrl: item.url, previewName: item.previewName || previewTitle, existingPlaceId: existingPlace.id, existingName: existingPlace.name, existingJobId: existingPlace.job_id, existingCollectedAt: existingPlace.collected_at, reason: "duplicate_already_enriched" } });
          await emitProgress(`[${placeNum}/${itemsToProcess.length}] Duplicado ignorado: ${previewTitle}`);
          continue;
        }
        await emitProgress(
          `[${placeNum}/${itemsToProcess.length}] Extraindo ficha: ${previewTitle}...`
        );
        detailPage = await browser.newPage();
        await detailPage.emulateLocale("pt-BR");
        await detailPage.emulateTimezone("America/Sao_Paulo");
        await detailPage.setExtraHTTPHeaders({ "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8" });
        await detailPage.setViewport({ width: 1366, height: 768 });
        await detailPage.goto(item.url, { waitUntil: "domcontentloaded", timeout: 3e4 });
        await detailPage.waitForSelector("h1", { timeout: 12e3 }).catch(() => {
        });
        await new Promise((resolve) => setTimeout(resolve, 700));
        const placeRecord = await extractPlaceDetails(detailPage, jobId, item.url);
        if (!placeRecord.name && item.previewName) {
          placeRecord.name = item.previewName;
        }
        if (!placeRecord.name.trim()) {
          throw new Error("A ficha abriu, mas o nome do estabelecimento n\xE3o foi identificado; registro n\xE3o salvo.");
        }
        if (!placeRecord.maps_url.includes("/maps/place/")) {
          placeRecord.maps_url = item.url;
        }
        await insertPlace(placeRecord);
        totalCollected++;
        await safeAudit({ category: "scraper", event: "place.saved", message: "Ficha salva no SQLite.", jobId, metadata: { placeId: placeRecord.id, name: placeRecord.name, mapsUrl: placeRecord.maps_url, missingFields: missingFields2(placeRecord) } });
        await emitProgress(
          `[${placeNum}/${itemsToProcess.length}] Coletado: ${placeRecord.name}`
        );
      } catch (placeErr) {
        if (isTransientBrowserError(placeErr) && !retriedItems.has(i)) {
          retriedItems.add(i);
          await safeAudit({ level: "warn", category: "scraper", event: "browser.transient_failure_retry", message: "Falha transit\xF3ria do Chromium; reconectando e repetindo esta ficha uma \xFAnica vez.", jobId, metadata: { mapsUrl: item.url, attempt: 2, error: placeErr?.message || String(placeErr) } });
          try {
            await connectAndTrackBrowser();
            i--;
            continue;
          } catch (reconnectError) {
            placeErr = reconnectError;
          }
        }
        totalErrors++;
        await safeAudit({ level: "error", category: "scraper", event: "place.extraction_failed", message: placeErr?.message || "Falha ao extrair ficha.", jobId, metadata: { mapsUrl: item.url, previewName: item.previewName || previewTitle, stack: String(placeErr?.stack || "").slice(0, 4e3) } }).catch(() => {
        });
        console.error(`Erro ao coletar ficha ${item.url}:`, placeErr.message);
        try {
          await emitProgress(
            `[${placeNum}/${itemsToProcess.length}] Erro na ficha: ${placeErr?.message || "falha desconhecida"}`
          );
        } catch (progressError) {
          console.error("Falha ao reportar erro de ficha; continuando coleta:", progressError);
        }
      } finally {
        if (detailPage) {
          try {
            await detailPage.close();
          } catch {
          }
        }
      }
      await new Promise((r) => setTimeout(r, 600));
    }
    const hadPartialFailures = totalErrors > 0 || eligibleUrlsInRun.size < limitRequested && !reachedEndOfList || totalCollected === 0 && totalDuplicates > 0;
    const finalStatus = handle.cancelled ? "stopped" : hadPartialFailures ? "partial" : "completed";
    const statusMsg = handle.cancelled ? `Coleta interrompida. ${totalCollected} registros salvos; ${totalErrors} falhas.` : hadPartialFailures ? `Coleta encerrada parcialmente: ${totalCollected} registros salvos, ${totalDuplicates} duplicados, ${totalErrors} falhas. Foram avaliadas ${Math.min(eligibleUrlsInRun.size, limitRequested)} fichas, dentro do limite solicitado de ${limitRequested}; isso n\xE3o comprova que n\xE3o existam outros resultados.` : `Coleta conclu\xEDda: ${totalCollected} registros salvos, ${totalDuplicates} duplicados e ${totalErrors} falhas.`;
    await safeAudit({ level: finalStatus === "partial" ? "warn" : "info", category: "scraper", event: "job.finished", message: statusMsg, jobId, metadata: { status: finalStatus, totalFound, totalCollected, totalDuplicates, totalErrors, scrollAttempts, reachedEndOfList, databaseCountBefore: baselineCount, newCandidatesFound: discoveredUrls.length, eligibleCandidatesEvaluated: eligibleUrlsInRun.size, requestedLimit: limitRequested } });
    await emitProgress(statusMsg, {
      status: finalStatus,
      status_message: statusMsg,
      completed_at: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (error) {
    const errMsg = error.message || "Erro inesperado durante a coleta.";
    await safeAudit({ level: handle.cancelled ? "warn" : "error", category: "scraper", event: handle.cancelled ? "job.stopped" : "job.failed", message: errMsg, jobId, metadata: { stack: String(error?.stack || "").slice(0, 5e3), totalFound, totalCollected, totalDuplicates, totalErrors } }).catch(() => {
    });
    console.error("Scraper fatal error:", error);
    if (handle.cancelled) {
      await emitProgress("Coleta interrompida pelo usu\xE1rio.", {
        status: "stopped",
        status_message: `Coleta interrompida. ${totalCollected} registros salvos antes do encerramento.`,
        completed_at: (/* @__PURE__ */ new Date()).toISOString()
      });
    } else {
      totalErrors++;
      await emitProgress(`Erro na coleta: ${errMsg}`, {
        status: "failed",
        status_message: errMsg,
        completed_at: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  } finally {
    activeJobs.delete(jobId);
    if (browser) {
      try {
        await browser.close();
      } catch {
      }
    }
    try {
      const reportPath = await writeRunReport(jobId, baselineCount);
      await safeAudit({ category: "scraper", event: "job.report_written", message: "Relat\xF3rio JSON de evid\xEAncias gerado.", jobId, metadata: { reportPath, databaseCountBefore: baselineCount } });
    } catch (reportError) {
      await safeAudit({ level: "error", category: "scraper", event: "job.report_write_failed", message: reportError?.message || "N\xE3o foi poss\xEDvel gerar relat\xF3rio JSON.", jobId, metadata: { stack: String(reportError?.stack || "").slice(0, 3e3) } });
    }
  }
}

// src/shared/types.ts
var EXPORTABLE_FIELDS = [
  { key: "name", label: "Nome do estabelecimento", description: "Nome exibido na ficha" },
  { key: "category", label: "Categoria", description: "Categoria exibida" },
  { key: "address", label: "Endere\xE7o", description: "Endere\xE7o exibido" },
  { key: "phone", label: "Telefone", description: "Telefone exibido" },
  { key: "website", label: "Site", description: "URL apresentada na ficha" },
  { key: "rating", label: "Nota", description: "Avalia\xE7\xE3o exibida" },
  { key: "review_count", label: "Quantidade de avalia\xE7\xF5es", description: "N\xFAmero exibido" },
  { key: "price_range", label: "Faixa de pre\xE7o", description: "Quando exibida" },
  { key: "opening_hours", label: "Hor\xE1rios de funcionamento", description: "Hor\xE1rios apresentados na ficha" },
  { key: "business_status", label: "Status de funcionamento", description: "Aberto, fechado, etc." },
  { key: "latitude", label: "Latitude", description: "Extra\xEDda diretamente dos dados da URL/p\xE1gina" },
  { key: "longitude", label: "Longitude", description: "Extra\xEDda diretamente dos dados da URL/p\xE1gina" },
  { key: "maps_url", label: "Link do Google Maps", description: "URL da ficha" },
  { key: "description", label: "Descri\xE7\xE3o", description: "Descri\xE7\xE3o apresentada, se houver" },
  { key: "services_attributes", label: "Servi\xE7os e atributos", description: "Informa\xE7\xF5es exibidas na ficha" },
  { key: "photos", label: "Fotos (URLs)", description: "URLs das fotos vis\xEDveis na ficha" },
  { key: "videos", label: "V\xEDdeos (URLs)", description: "URLs ou fontes de v\xEDdeos vis\xEDveis na ficha" },
  { key: "logo_url", label: "Logo / Foto de perfil", description: "Imagem ou avatar exibido na ficha" },
  { key: "social_links", label: "Redes sociais (URLs)", description: "Links sociais explicitamente exibidos na ficha do Google Maps" },
  { key: "reviews", label: "Avalia\xE7\xF5es individuais", description: "Coment\xE1rios, nota, autor, data, resposta do propriet\xE1rio e m\xEDdia quando vis\xEDveis" },
  { key: "review_topics", label: "Categorias dos coment\xE1rios", description: "T\xF3picos sugeridos pelo Google Maps e suas contagens" },
  { key: "additional_attributes", label: "Atributos adicionais", description: "Informa\xE7\xF5es p\xFAblicas da aba Sobre, incluindo facilidades e servi\xE7os" },
  { key: "media_items", label: "M\xEDdia estruturada", description: "Itens de m\xEDdia com tipo, URL, texto alternativo e miniatura" },
  { key: "booking_url", label: "URL de Agendamento", description: 'Link "Agendar on-line" ou "Book online" da ficha' },
  { key: "plus_code", label: "Plus Code", description: "C\xF3digo geogr\xE1fico apresentado na ficha" },
  { key: "attributes", label: "Atributos do estabelecimento", description: "Atributos p\xFAblicos normalizados" },
  { key: "accessibility_attributes", label: "Acessibilidade", description: "Atributos p\xFAblicos de acessibilidade" },
  { key: "next_opening_text", label: "Pr\xF3xima abertura (texto)", description: "Texto de pr\xF3xima abertura exibido pelo Maps" },
  { key: "next_open_day", label: "Pr\xF3ximo dia de abertura", description: "Dia explicitamente identific\xE1vel no status" },
  { key: "next_open_time", label: "Pr\xF3ximo hor\xE1rio de abertura", description: "Hor\xE1rio explicitamente identific\xE1vel no status" },
  { key: "visible_photos_count", label: "Total de fotos informado", description: "Contagem textual expl\xEDcita do Maps, n\xE3o contagem inferida" },
  { key: "postal_code", label: "CEP / c\xF3digo postal", description: "Quando expl\xEDcito no endere\xE7o p\xFAblico" },
  { key: "country", label: "Pa\xEDs", description: "Componente do endere\xE7o quando identific\xE1vel" },
  { key: "city", label: "Cidade", description: "Componente do endere\xE7o quando identific\xE1vel" },
  { key: "state", label: "Estado / regi\xE3o", description: "Componente do endere\xE7o quando identific\xE1vel" },
  { key: "source_place_id", label: "ID da ficha na fonte", description: "Identificador extra\xEDdo da URL do Google Maps" },
  { key: "source_url", label: "URL original da fonte", description: "URL da ficha usada na coleta" },
  { key: "attributes", label: "Atributos do estabelecimento", description: "Atributos p\xFAblicos normalizados" },
  { key: "accessibility_attributes", label: "Acessibilidade", description: "Atributos p\xFAblicos de acessibilidade" },
  { key: "next_opening_text", label: "Pr\xF3xima abertura (texto)", description: "Texto de pr\xF3xima abertura exibido pelo Maps" },
  { key: "next_open_day", label: "Pr\xF3ximo dia de abertura", description: "Dia explicitamente identific\xE1vel no status" },
  { key: "next_open_time", label: "Pr\xF3ximo hor\xE1rio de abertura", description: "Hor\xE1rio explicitamente identific\xE1vel no status" },
  { key: "visible_photos_count", label: "Total de fotos informado", description: "Contagem textual expl\xEDcita do Maps, n\xE3o contagem inferida" },
  { key: "popular_times", label: "Hor\xE1rios de movimento", description: "JSON de dados exibidos publicamente, quando dispon\xEDveis" },
  { key: "rating_distribution", label: "Distribui\xE7\xE3o de avalia\xE7\xF5es", description: "Contagens por estrelas quando exibidas" },
  { key: "review_highlights", label: "Destaques de avalia\xE7\xF5es", description: "Trechos de resumo exibidos pelo Maps" },
  { key: "field_status", label: "Estado de captura dos campos", description: "JSON com status de observa\xE7\xE3o por campo" },
  { key: "collected_at", label: "Data e hora da coleta", description: "Registrada pelo aplicativo" }
];

// src/server/scraper/csv.ts
function sanitizeCsvCell(value) {
  if (value === null || value === void 0) return "";
  let str = String(value);
  if (/^[\s\u0000-\u001F]*[=+\-@]/.test(str) || /^[\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
function generateCsv(records, selectedFieldKeys) {
  const fields = selectedFieldKeys && selectedFieldKeys.length > 0 ? selectedFieldKeys.map((key) => EXPORTABLE_FIELDS.find((f) => f.key === key)).filter(Boolean) : EXPORTABLE_FIELDS;
  const headerRow = fields.map((f) => sanitizeCsvCell(f.label)).join(",");
  const rows = records.map((record) => {
    return fields.map((f) => {
      const val = record[f.key] ?? "";
      return sanitizeCsvCell(val);
    }).join(",");
  });
  return "\uFEFF" + [headerRow, ...rows].join("\r\n");
}

// server.ts
import { timingSafeEqual, createHash, randomBytes, scryptSync } from "node:crypto";
import jwt from "jsonwebtoken";
import { waitUntil } from "@vercel/functions";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path3.dirname(__filename);
function safeEqual(left, right) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
function hasStaticApiKey(value) {
  const configured = (process.env.MAPSCRAPE_API_KEYS || "").split(",").map((entry) => entry.trim()).filter(Boolean);
  return configured.some((candidate) => safeEqual(candidate, value));
}
function sessionSecret() {
  return process.env.MAPSCRAPE_SESSION_SECRET?.trim() || "mapscrape-dev-session-secret-key-32ch";
}
function passwordHash(password, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
function passwordMatches(password, stored) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}
function createSessionToken(user) {
  const secret = sessionSecret();
  if (!secret) throw new Error("MAPSCRAPE_SESSION_SECRET ausente");
  return jwt.sign({ email: user.email, role: user.role }, secret, { subject: user.id, expiresIn: "12h", issuer: "mapscrape" });
}
function verifiedSession(token) {
  const secret = sessionSecret();
  if (!secret) return null;
  try {
    const payload = jwt.verify(token, secret, { issuer: "mapscrape" });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string" || payload.role !== "admin" && payload.role !== "user") return null;
    return { sub: payload.sub, email: payload.email, role: payload.role };
  } catch {
    return null;
  }
}
async function authenticatedConsumer(req) {
  const match = /^Bearer\s+(.+)$/i.exec(req.header("authorization") || "");
  const supplied = match ? match[1] : typeof req.query.token === "string" ? req.query.token.trim() : null;
  if (!supplied) return null;
  const session = verifiedSession(supplied);
  if (session) {
    const user = await findUserById(session.sub);
    if (!user || user.email !== session.email || user.role !== session.role) return null;
    return { id: user.id, consumer_project: `account:${user.id}`, role: user.role, email: user.email, accountId: user.id };
  }
  if (hasStaticApiKey(supplied)) return { id: "static-key", consumer_project: "operator-static-key" };
  const keyHash = createHash("sha256").update(supplied).digest("hex");
  return findActiveApiCredential(keyHash);
}
async function requireAuthenticatedConsumer(req, res, next) {
  try {
    const consumer = await authenticatedConsumer(req);
    if (!consumer) {
      res.status(401).json({ error: "unauthorized", message: "Informe uma chave de API v\xE1lida no cabe\xE7alho Authorization: Bearer." });
      return;
    }
    req.mapscrapeConsumer = consumer;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-MapScrape-Consumer", consumer.consumer_project);
    next();
  } catch (error) {
    console.error("API credential lookup failed:", error instanceof Error ? error.message : "unknown");
    res.status(503).json({ error: "authentication_unavailable" });
  }
}
function hasProvisioningAccess(req) {
  const match = /^Bearer\s+(.+)$/i.exec(req.header("authorization") || "");
  const session = match ? verifiedSession(match[1]) : null;
  if (session?.role === "admin") return true;
  const expected = process.env.MAPSCRAPE_PROVISIONING_TOKEN?.trim();
  const provided = req.header("x-mapscrape-provisioning-token") || "";
  return Boolean(expected && provided && safeEqual(expected, provided));
}
function apiLead(record) {
  const parse = (value, fallback) => {
    if (typeof value !== "string" || !value.trim()) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  };
  return {
    ...record,
    photos: typeof record.photos === "string" ? record.photos.split(" | ").filter(Boolean) : [],
    videos: typeof record.videos === "string" ? record.videos.split(" | ").filter(Boolean) : [],
    reviews: parse(record.reviews, []),
    review_topics: parse(record.review_topics, []),
    additional_attributes: parse(record.additional_attributes, {}),
    media_items: parse(record.media_items, []),
    services_attributes: parse(record.services_attributes, {}),
    social_links: typeof record.social_links === "string" ? record.social_links.split(" | ").filter(Boolean) : []
  };
}
async function safeWriteAuditLog(input) {
  try {
    await writeAuditLog(input);
  } catch (error) {
    console.error("Audit log write failed:", error);
  }
}
async function createApp() {
  await initDb();
  const bootstrapEmail = process.env.MAPSCRAPE_ADMIN_EMAIL?.trim().toLowerCase();
  const bootstrapPassword = process.env.MAPSCRAPE_ADMIN_PASSWORD;
  if (bootstrapEmail && bootstrapPassword && sessionSecret() && !await findUserByEmail(bootstrapEmail)) {
    await createUser({
      id: `usr_${randomBytes(16).toString("hex")}`,
      email: bootstrapEmail,
      displayName: "Administrador",
      passwordHash: passwordHash(bootstrapPassword),
      role: "admin",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  await initAuditLog();
  await safeWriteAuditLog({ category: "server", event: "server.start", message: "Servidor iniciado e banco inicializado." });
  console.log("SQLite database initialized.");
  const app = express();
  const PORT = Number(process.env.PORT) || 3e3;
  const isDev = process.env.NODE_ENV !== "production";
  app.use(express.json());
  const accountAuthLimiter = rateLimit({ windowMs: 15 * 60 * 1e3, limit: 20, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false, message: { error: "too_many_attempts", message: "Muitas tentativas inv\xE1lidas. Aguarde 15 minutos e tente novamente." } });
  app.post("/api/auth/register", accountAuthLimiter, async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const displayName = typeof req.body?.name === "string" ? req.body.name.trim().replace(/\s+/g, " ") : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!sessionSecret()) return res.status(503).json({ error: "auth_not_configured", message: "A autentica\xE7\xE3o ainda n\xE3o foi configurada pelo administrador." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || displayName.length < 2 || displayName.length > 100 || password.length < 12 || password.length > 200) {
      return res.status(422).json({ error: "invalid_registration", message: "Informe nome, e-mail v\xE1lido e senha com pelo menos 12 caracteres." });
    }
    try {
      if (await findUserByEmail(email)) return res.status(409).json({ error: "email_already_registered", message: "Este e-mail j\xE1 possui cadastro." });
      const bootstrapEmail2 = (process.env.MAPSCRAPE_ADMIN_EMAIL?.trim() || "olfnetto@gmail.com").toLowerCase();
      const isFirstAccount = await countUsers() === 0;
      let role = "user";
      if (isFirstAccount) {
        if (email !== bootstrapEmail2) {
          return res.status(403).json({
            error: "initial_admin_email_required",
            message: `O primeiro cadastro deve usar o e-mail administrador configurado: ${bootstrapEmail2}.`
          });
        }
        role = "admin";
      }
      const id = `usr_${randomBytes(16).toString("hex")}`;
      await createUser({ id, email, displayName, passwordHash: passwordHash(password), role, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
      const token = createSessionToken({ id, email, role });
      res.setHeader("Cache-Control", "no-store");
      return res.status(201).json({ token, user: { id, email, name: displayName, role } });
    } catch (error) {
      return res.status(500).json({ error: "registration_failed", message: error instanceof Error ? error.message : "N\xE3o foi poss\xEDvel criar a conta." });
    }
  });
  app.post("/api/auth/login", accountAuthLimiter, async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!sessionSecret()) return res.status(503).json({ error: "auth_not_configured", message: "A autentica\xE7\xE3o ainda n\xE3o foi configurada pelo administrador." });
    try {
      const user = await findUserByEmail(email);
      if (!user || !passwordMatches(password, user.password_hash)) return res.status(401).json({ error: "invalid_credentials", message: "E-mail ou senha incorretos." });
      await updateUserLogin(user.id, (/* @__PURE__ */ new Date()).toISOString());
      const token = createSessionToken({ id: user.id, email: user.email, role: user.role });
      res.setHeader("Cache-Control", "no-store");
      return res.json({ token, user: { id: user.id, email: user.email, name: user.display_name, role: user.role } });
    } catch (error) {
      return res.status(500).json({ error: "login_failed", message: error instanceof Error ? error.message : "N\xE3o foi poss\xEDvel entrar." });
    }
  });
  app.get("/api/auth/me", async (req, res) => {
    const match = /^Bearer\s+(.+)$/i.exec(req.header("authorization") || "");
    const session = match ? verifiedSession(match[1]) : null;
    if (!session) return res.status(401).json({ error: "unauthorized" });
    const user = await findUserById(session.sub);
    if (!user || user.email !== session.email || user.role !== session.role) return res.status(401).json({ error: "session_expired" });
    res.setHeader("Cache-Control", "no-store");
    return res.json({ user: { id: user.id, email: user.email, name: user.display_name, role: user.role } });
  });
  app.get("/api/health", async (_req, res) => {
    try {
      const { countPlaces: countPlaces2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const totalPlaces = await countPlaces2();
      return res.json({ status: "ok", database: "connected", totalPlaces, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    } catch (error) {
      console.error("Health check failed:", error);
      return res.status(503).json({ status: "degraded", database: "unavailable" });
    }
  });
  app.get("/api/health/browser", async (_req, res) => {
    let endpoint;
    try {
      const { getBrowserWSEndpoint: getBrowserWSEndpoint2, getBrowserEndpointDiagnostic: getBrowserEndpointDiagnostic2 } = await Promise.resolve().then(() => (init_browserless_endpoint(), browserless_endpoint_exports));
      endpoint = getBrowserWSEndpoint2();
      const diagnostic = getBrowserEndpointDiagnostic2(endpoint);
      const puppeteer3 = (await import("puppeteer")).default;
      const browser = await puppeteer3.connect({ browserWSEndpoint: endpoint, protocolTimeout: 3e4 });
      await browser.close();
      return res.json({ status: "ok", connection: "connected-and-closed", ...diagnostic });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha desconhecida";
      let diagnostic = {};
      try {
        const { getBrowserEndpointDiagnostic: getBrowserEndpointDiagnostic2 } = await Promise.resolve().then(() => (init_browserless_endpoint(), browserless_endpoint_exports));
        if (endpoint) diagnostic = getBrowserEndpointDiagnostic2(endpoint);
      } catch {
        const configured = process.env.BROWSER_WS_ENDPOINT?.trim();
        if (!configured) {
          return res.status(503).json({ status: "error", reason: "BROWSER_WS_ENDPOINT ausente ou vazia." });
        }
        try {
          const raw = new URL(configured);
          diagnostic = {
            protocol: raw.protocol,
            hostname: raw.hostname,
            hasCredentials: Boolean(raw.username || raw.password),
            hasQuery: Boolean(raw.search),
            pathDepth: raw.pathname.split("/").filter(Boolean).length,
            endpointLength: configured.length
          };
        } catch {
          diagnostic = { reason: "URL configurada inv\xE1lida", endpointLength: configured.length };
        }
      }
      return res.status(503).json({ status: "error", reason: message.slice(0, 240), ...diagnostic });
    }
  });
  const sseClients = /* @__PURE__ */ new Map();
  const broadcastJobUpdate = (job) => {
    const clients = sseClients.get(job.id);
    if (clients) {
      const data = `data: ${JSON.stringify(job)}

`;
      clients.forEach((res) => {
        try {
          res.write(data);
        } catch {
        }
      });
    }
  };
  app.post("/api/scrape/start", requireAuthenticatedConsumer, async (req, res) => {
    try {
      const { segment, projectName, categoryName, location, limit } = req.body;
      const consumer = req.mapscrapeConsumer;
      if (!consumer) return res.status(401).json({ error: "unauthorized" });
      if (!segment || typeof segment !== "string" || !segment.trim()) {
        return res.status(400).json({ error: "O campo segmento \xE9 obrigat\xF3rio." });
      }
      if (!location || typeof location !== "string" || !location.trim()) {
        return res.status(400).json({ error: "O campo localiza\xE7\xE3o \xE9 obrigat\xF3rio." });
      }
      const limitNum = Math.max(1, Math.min(100, Number(limit) || 20));
      const finalProjectName = typeof projectName === "string" && projectName.trim() ? projectName.trim().slice(0, 120) : `${segment.trim()} \xB7 ${location.trim()}`;
      const finalCategoryName = typeof categoryName === "string" && categoryName.trim() ? categoryName.trim().slice(0, 120) : segment.trim();
      const project = await resolveProject(consumer.consumer_project, finalProjectName);
      const category = await resolveSearchCategory(consumer.consumer_project, finalCategoryName);
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newJob = {
        id: jobId,
        user_id: consumer.consumer_project,
        segment: segment.trim(),
        project_name: project.name,
        project_id: project.id,
        category_id: category.id,
        location: location.trim(),
        limit_requested: limitNum,
        status: "running",
        status_message: "Iniciando automa\xE7\xE3o...",
        total_found: 0,
        total_collected: 0,
        total_duplicates: 0,
        total_errors: 0,
        current_step: "Preparando navegador...",
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      await createJob(newJob);
      await safeWriteAuditLog({ category: "scraper", event: "job.started", message: "Coleta iniciada.", jobId, metadata: { segment: segment.trim(), location: location.trim(), limit: limitNum } });
      const scrapePromise = runScraperJob(jobId, segment, location, limitNum, (updatedJob) => {
        broadcastJobUpdate(updatedJob);
      }).catch(async (err) => {
        console.error("Job error:", err);
        await safeWriteAuditLog({ level: "error", category: "scraper", event: "job.unhandled_error", message: err?.message || "Erro n\xE3o tratado na tarefa.", jobId, metadata: { stack: String(err?.stack || "").slice(0, 5e3) } }).catch(() => {
        });
      });
      if (process.env.VERCEL) waitUntil(scrapePromise);
      return res.json({
        success: true,
        jobId,
        message: "Coleta iniciada com sucesso."
      });
    } catch (err) {
      console.error("Start error:", err);
      await safeWriteAuditLog({ level: "error", category: "api", event: "job.start_failed", message: err?.message || "Falha ao iniciar coleta.", metadata: { stack: String(err?.stack || "").slice(0, 4e3) } }).catch(() => {
      });
      return res.status(500).json({ error: err.message || "Erro ao iniciar coleta." });
    }
  });
  app.post("/api/scrape/stop/:id", requireAuthenticatedConsumer, async (req, res) => {
    const { id } = req.params;
    const consumer = req.mapscrapeConsumer;
    const ownedJob = await getJob(id, consumer.consumer_project);
    if (!ownedJob) return res.status(404).json({ error: "Pesquisa n\xE3o encontrada." });
    const stopped = stopScrapeJob(id);
    await safeWriteAuditLog({ level: stopped ? "warn" : "info", category: "scraper", event: stopped ? "job.stop_requested" : "job.stop_not_active", message: stopped ? "Interrup\xE7\xE3o solicitada pelo usu\xE1rio." : "Solicita\xE7\xE3o de interrup\xE7\xE3o para tarefa n\xE3o ativa.", jobId: id });
    return res.json({
      success: true,
      stopped,
      message: stopped ? "Solicita\xE7\xE3o de interrup\xE7\xE3o enviada." : "A tarefa n\xE3o est\xE1 em execu\xE7\xE3o ativa."
    });
  });
  app.get("/api/scrape/status/:id", requireAuthenticatedConsumer, async (req, res) => {
    const { id } = req.params;
    const consumer = req.mapscrapeConsumer;
    const job = await getJob(id, consumer.consumer_project);
    if (!job) {
      return res.status(404).json({ error: "Pesquisa n\xE3o encontrada." });
    }
    return res.json({
      ...job,
      isRunning: isJobRunning(id)
    });
  });
  app.get("/api/scrape/stream/:id", requireAuthenticatedConsumer, async (req, res) => {
    const { id } = req.params;
    const consumer = req.mapscrapeConsumer;
    const job = await getJob(id, consumer.consumer_project);
    if (!job) return res.status(404).json({ error: "Pesquisa n\xE3o encontrada." });
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write(`data: ${JSON.stringify(job)}

`);
    if (!sseClients.has(id)) {
      sseClients.set(id, []);
    }
    sseClients.get(id).push(res);
    req.on("close", () => {
      const clients = sseClients.get(id) || [];
      const idx = clients.indexOf(res);
      if (idx !== -1) clients.splice(idx, 1);
      if (clients.length === 0) sseClients.delete(id);
    });
  });
  app.get("/api/places", requireAuthenticatedConsumer, async (req, res) => {
    try {
      const { jobId, query, category, sortBy, sortOrder, offset, limit } = req.query;
      const consumer = req.mapscrapeConsumer;
      const result = await getPlaces({
        jobId: jobId ? String(jobId) : void 0,
        query: query ? String(query) : void 0,
        category: category ? String(category) : void 0,
        consumerProject: consumer.consumer_project,
        sortBy: sortBy ? String(sortBy) : void 0,
        sortOrder: sortOrder === "asc" ? "asc" : "desc",
        offset: offset ? Number(offset) : 0,
        limit: limit ? Number(limit) : 50
      });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message || "Erro ao consultar locais." });
    }
  });
  app.get("/api/categories", requireAuthenticatedConsumer, async (req, res) => {
    try {
      return res.json({ categories: await listPlaceCategories(req.mapscrapeConsumer.consumer_project) });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Erro ao consultar categorias." });
    }
  });
  app.get("/api/projects", requireAuthenticatedConsumer, async (req, res) => {
    try {
      const consumer = req.mapscrapeConsumer;
      return res.json({ projects: await listProjects(consumer.consumer_project) });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Erro ao consultar projetos." });
    }
  });
  app.post("/api/projects", requireAuthenticatedConsumer, async (req, res) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (!name) return res.status(422).json({ error: "project_name_required" });
      const consumer = req.mapscrapeConsumer;
      const project = await resolveProject(consumer.consumer_project, name);
      return res.status(201).json({ project });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Erro ao criar projeto." });
    }
  });
  app.patch("/api/projects/:id", requireAuthenticatedConsumer, async (req, res) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (!name) return res.status(422).json({ error: "project_name_required", message: "O nome do projeto \xE9 obrigat\xF3rio." });
      const consumer = req.mapscrapeConsumer;
      const updated = await updateProject(consumer.consumer_project, String(req.params.id), name);
      if (!updated) return res.status(404).json({ error: "project_not_found", message: "Projeto n\xE3o encontrado." });
      return res.json({ project: updated });
    } catch (err) {
      if (err.message === "project_name_conflict") return res.status(409).json({ error: "project_name_conflict", message: "J\xE1 existe um projeto com este nome." });
      return res.status(500).json({ error: err.message || "Erro ao atualizar projeto." });
    }
  });
  app.delete("/api/projects/:id", requireAuthenticatedConsumer, async (req, res) => {
    try {
      const consumer = req.mapscrapeConsumer;
      const deleted = await deleteProject(consumer.consumer_project, String(req.params.id));
      if (!deleted) return res.status(404).json({ error: "project_not_found", message: "Projeto n\xE3o encontrado." });
      return res.json({ success: true, message: "Projeto exclu\xEDdo com sucesso." });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Erro ao excluir projeto." });
    }
  });
  app.get("/api/search-categories", requireAuthenticatedConsumer, async (req, res) => {
    try {
      const consumer = req.mapscrapeConsumer;
      return res.json({ categories: await listSearchCategories(consumer.consumer_project) });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Erro ao consultar categorias de pesquisa." });
    }
  });
  app.post("/api/search-categories", requireAuthenticatedConsumer, async (req, res) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (!name) return res.status(422).json({ error: "category_name_required" });
      const consumer = req.mapscrapeConsumer;
      const category = await resolveSearchCategory(consumer.consumer_project, name);
      return res.status(201).json({ category });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Erro ao criar categoria." });
    }
  });
  app.patch("/api/search-categories/:id", requireAuthenticatedConsumer, async (req, res) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (!name) return res.status(422).json({ error: "category_name_required", message: "O nome da categoria \xE9 obrigat\xF3rio." });
      const consumer = req.mapscrapeConsumer;
      const updated = await updateSearchCategory(consumer.consumer_project, String(req.params.id), name);
      if (!updated) return res.status(404).json({ error: "category_not_found", message: "Categoria n\xE3o encontrada." });
      return res.json({ category: updated });
    } catch (err) {
      if (err.message === "category_name_conflict") return res.status(409).json({ error: "category_name_conflict", message: "J\xE1 existe uma categoria com este nome." });
      return res.status(500).json({ error: err.message || "Erro ao atualizar categoria." });
    }
  });
  app.delete("/api/search-categories/:id", requireAuthenticatedConsumer, async (req, res) => {
    try {
      const consumer = req.mapscrapeConsumer;
      const deleted = await deleteSearchCategory(consumer.consumer_project, String(req.params.id));
      if (!deleted) return res.status(404).json({ error: "category_not_found", message: "Categoria n\xE3o encontrada." });
      return res.json({ success: true, message: "Categoria exclu\xEDda com sucesso." });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Erro ao excluir categoria." });
    }
  });
  app.get("/api/places/all", requireAuthenticatedConsumer, async (req, res) => {
    try {
      const { jobId } = req.query;
      const consumer = req.mapscrapeConsumer;
      const records = await getAllPlaces(jobId ? String(jobId) : void 0, req.mapscrapeConsumer.consumer_project);
      return res.json(records);
    } catch (err) {
      return res.status(500).json({ error: err.message || "Erro ao consultar todos os locais." });
    }
  });
  app.get("/api/history", requireAuthenticatedConsumer, async (req, res) => {
    try {
      const history = await listJobs(req.mapscrapeConsumer.consumer_project);
      return res.json(history);
    } catch (err) {
      return res.status(500).json({ error: err.message || "Erro ao consultar hist\xF3rico." });
    }
  });
  app.delete("/api/history/:id", requireAuthenticatedConsumer, async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await deleteJob(id, req.mapscrapeConsumer.consumer_project);
      if (!deleted) return res.status(404).json({ error: "Pesquisa n\xE3o encontrada." });
      return res.json({ success: true, message: "Pesquisa removida com sucesso." });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Erro ao remover hist\xF3rico." });
    }
  });
  app.post("/api/export/csv", requireAuthenticatedConsumer, async (req, res) => {
    try {
      const { jobId, placeIds, fields, filename } = req.body;
      let records = [];
      if (placeIds && Array.isArray(placeIds) && placeIds.length > 0) {
        records = await getPlacesByIds(placeIds, req.mapscrapeConsumer.consumer_project);
      } else if (jobId) {
        records = await getAllPlaces(jobId, req.mapscrapeConsumer.consumer_project);
      } else {
        records = await getAllPlaces(void 0, req.mapscrapeConsumer.consumer_project);
      }
      const csvContent = generateCsv(records, fields);
      const safeFilename = filename ? String(filename).replace(/[^a-zA-Z0-9_-]/g, "_") : `mapscrape_export_${Date.now()}`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}.csv"`);
      return res.send(csvContent);
    } catch (err) {
      console.error("Export error:", err);
      return res.status(500).json({ error: err.message || "Erro ao exportar CSV." });
    }
  });
  app.get("/api/reports/:jobId", requireAuthenticatedConsumer, async (req, res) => {
    try {
      const jobId = String(req.params.jobId || "");
      const ownedJob = await getJob(jobId, req.mapscrapeConsumer.consumer_project);
      if (!ownedJob) return res.status(404).json({ error: "Pesquisa n\xE3o encontrada." });
      const report = await readRunReport(jobId);
      if (!report) return res.status(404).json({ error: "Relat\xF3rio ainda n\xE3o existe para esta pesquisa." });
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="mapscrape-report-${String(req.params.jobId).replace(/[^a-zA-Z0-9_-]/g, "_")}.json"`);
      return res.json(report);
    } catch (err) {
      return res.status(500).json({ error: err.message || "Erro ao carregar relat\xF3rio." });
    }
  });
  app.get("/api/reports/:jobId/pdf", requireAuthenticatedConsumer, async (req, res) => {
    try {
      const jobId = String(req.params.jobId || "");
      const ownedJob = await getJob(jobId, req.mapscrapeConsumer.consumer_project);
      if (!ownedJob) return res.status(404).json({ error: "Pesquisa n\xE3o encontrada." });
      const pdf = await readRunReportPdf(jobId);
      if (!pdf) return res.status(404).json({ error: "PDF ainda n\xE3o existe para esta pesquisa. Confira se a execu\xE7\xE3o j\xE1 terminou e se a gera\xE7\xE3o do PDF foi bem-sucedida." });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="mapscrape-report-${jobId}.pdf"`);
      return res.send(pdf);
    } catch (err) {
      return res.status(500).json({ error: err.message || "Erro ao carregar PDF." });
    }
  });
  app.get("/api/field-coverage", requireAuthenticatedConsumer, async (req, res) => {
    try {
      const jobId = req.query.jobId ? String(req.query.jobId) : void 0;
      const consumer = req.mapscrapeConsumer;
      const records = await getAllPlaces(jobId, req.mapscrapeConsumer.consumer_project);
      const fields = [
        { key: "name", label: "Nome" },
        { key: "category", label: "Categoria" },
        { key: "address", label: "Endere\xE7o" },
        { key: "phone", label: "Telefone" },
        { key: "website", label: "Site" },
        { key: "rating", label: "Nota" },
        { key: "review_count", label: "Quantidade de avalia\xE7\xF5es" },
        { key: "price_range", label: "Faixa de pre\xE7o" },
        { key: "opening_hours", label: "Hor\xE1rios" },
        { key: "business_status", label: "Status operacional" },
        { key: "latitude", label: "Latitude" },
        { key: "longitude", label: "Longitude" },
        { key: "maps_url", label: "Link do Maps" },
        { key: "description", label: "Descri\xE7\xE3o" },
        { key: "services_attributes", label: "Servi\xE7os e atributos" },
        { key: "photos", label: "Fotos (URLs)" },
        { key: "videos", label: "V\xEDdeos (URLs)" },
        { key: "logo_url", label: "Logo / Foto de perfil" },
        { key: "booking_url", label: "URL de agendamento" },
        { key: "social_links", label: "Redes sociais" },
        { key: "reviews", label: "Avalia\xE7\xF5es individuais" },
        { key: "review_topics", label: "T\xF3picos das avalia\xE7\xF5es" },
        { key: "review_highlights", label: "Destaques das avalia\xE7\xF5es" },
        { key: "rating_distribution", label: "Distribui\xE7\xE3o por estrelas" },
        { key: "popular_times", label: "Hor\xE1rios de movimento" },
        { key: "attributes", label: "Atributos do estabelecimento" },
        { key: "accessibility_attributes", label: "Acessibilidade" },
        { key: "additional_attributes", label: "Atributos adicionais" },
        { key: "media_items", label: "Galeria de m\xEDdia estruturada" },
        { key: "visible_photos_count", label: "Total de fotos informado" },
        { key: "next_opening_text", label: "Texto de pr\xF3xima abertura" },
        { key: "next_open_day", label: "Dia de pr\xF3xima abertura" },
        { key: "next_open_time", label: "Hor\xE1rio de pr\xF3xima abertura" },
        { key: "postal_code", label: "CEP / c\xF3digo postal" },
        { key: "country", label: "Pa\xEDs" },
        { key: "city", label: "Cidade" },
        { key: "state", label: "Estado / regi\xE3o" },
        { key: "source_place_id", label: "ID da ficha na fonte" },
        { key: "source_url", label: "URL original da fonte" },
        { key: "field_status", label: "Status de captura por campo" },
        { key: "collected_at", label: "Data da coleta" }
      ];
      const coverage = fields.map((field) => {
        const populated = records.reduce((count, record) => count + (String(record[field.key] ?? "").trim() ? 1 : 0), 0);
        return {
          ...field,
          populated,
          missing: records.length - populated,
          percentage: records.length ? Math.round(populated / records.length * 100) : 0
        };
      });
      const populatedCells = coverage.reduce((sum, field) => sum + field.populated, 0);
      const totalCells = records.length * fields.length;
      return res.json({
        totalRecords: records.length,
        totalFields: fields.length,
        averageCoverage: totalCells ? Math.round(populatedCells / totalCells * 100) : 0,
        fields: coverage
      });
    } catch (err) {
      return res.status(500).json({ error: err.message || "Erro ao calcular cobertura dos campos." });
    }
  });
  app.get("/api/logs", requireAuthenticatedConsumer, async (req, res) => {
    try {
      const result = await listAuditLogs({
        limit: req.query.limit ? Number(req.query.limit) : 100,
        offset: req.query.offset ? Number(req.query.offset) : 0,
        level: req.query.level ? String(req.query.level) : void 0,
        category: req.query.category ? String(req.query.category) : void 0,
        jobId: req.query.jobId ? String(req.query.jobId) : void 0,
        query: req.query.query ? String(req.query.query) : void 0,
        consumerProject: req.mapscrapeConsumer.consumer_project
      });
      return res.json(result);
    } catch (err) {
      await safeWriteAuditLog({ level: "error", category: "api", event: "logs.query_failed", message: err?.message || "Falha ao consultar logs." }).catch(() => {
      });
      return res.status(500).json({ error: err.message || "Erro ao consultar logs." });
    }
  });
  app.get("/api/logs/export", requireAuthenticatedConsumer, async (req, res) => {
    try {
      const result = await listAuditLogs({
        limit: 500,
        offset: 0,
        level: req.query.level ? String(req.query.level) : void 0,
        category: req.query.category ? String(req.query.category) : void 0,
        jobId: req.query.jobId ? String(req.query.jobId) : void 0,
        query: req.query.query ? String(req.query.query) : void 0,
        consumerProject: req.mapscrapeConsumer.consumer_project
      });
      const body = result.logs.map((log) => JSON.stringify({
        ...log,
        metadata: (() => {
          try {
            return JSON.parse(log.metadata || "{}");
          } catch {
            return log.metadata;
          }
        })()
      })).join("\n") + (result.logs.length ? "\n" : "");
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="mapscrape-audit-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.jsonl"`);
      return res.send(body);
    } catch (err) {
      return res.status(500).json({ error: err.message || "Erro ao exportar logs." });
    }
  });
  app.get("/api/v1/health", async (_req, res) => {
    try {
      const { countPlaces: countPlaces2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      return res.json({ status: "ok", service: "mapscrape-api", apiVersion: "v1", database: "connected", totalLeads: await countPlaces2(), timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    } catch {
      return res.status(503).json({ status: "degraded", service: "mapscrape-api", apiVersion: "v1", database: "unavailable" });
    }
  });
  app.post("/api/v1/provisioning/credentials", async (req, res) => {
    if (!hasProvisioningAccess(req)) return res.status(401).json({ error: "provisioning_unauthorized" });
    const consumerName = typeof req.body?.consumerName === "string" ? req.body.consumerName.trim() : "";
    const consumerProject = typeof req.body?.consumerProject === "string" ? req.body.consumerProject.trim() : "";
    if (!consumerName || !consumerProject || consumerName.length > 120 || consumerProject.length > 200) {
      return res.status(422).json({ error: "invalid_consumer", message: "consumerName e consumerProject s\xE3o obrigat\xF3rios e possuem limites de tamanho." });
    }
    try {
      const existing = (await listApiCredentials()).find((entry) => entry.consumer_project === consumerProject && entry.status === "active");
      if (existing) return res.status(409).json({ error: "credential_already_exists", message: "Este projeto j\xE1 possui uma credencial ativa. Revogue-a antes de emitir outra.", credentialId: existing.id });
      const secret = randomBytes(32).toString("hex");
      const id = `msc_${randomBytes(12).toString("hex")}`;
      await createApiCredential({ id, consumerName, consumerProject, keyHash: createHash("sha256").update(secret).digest("hex"), createdAt: (/* @__PURE__ */ new Date()).toISOString() });
      await safeWriteAuditLog({ category: "api", event: "api_credential.issued", message: "Credencial de API emitida.", metadata: { credentialId: id, consumerProject } });
      res.setHeader("Cache-Control", "no-store");
      return res.status(201).json({ data: { credentialId: id, apiKey: secret, consumerName, consumerProject, revealOnce: true } });
    } catch (error) {
      return res.status(500).json({ error: "credential_issue_failed", message: error instanceof Error ? error.message : "Falha ao emitir credencial." });
    }
  });
  app.post("/api/v1/provisioning/credentials/:id/rotate", async (req, res) => {
    if (!hasProvisioningAccess(req)) return res.status(401).json({ error: "provisioning_unauthorized" });
    const id = String(req.params.id);
    try {
      const current = (await listApiCredentials()).find((entry) => entry.id === id && entry.status === "active");
      if (!current) return res.status(404).json({ error: "active_credential_not_found" });
      const revoked = await revokeApiCredential(id);
      if (!revoked) return res.status(409).json({ error: "credential_rotation_conflict" });
      const secret = randomBytes(32).toString("hex");
      const newId = `msc_${randomBytes(12).toString("hex")}`;
      try {
        await createApiCredential({
          id: newId,
          consumerName: current.consumer_name,
          consumerProject: current.consumer_project,
          keyHash: createHash("sha256").update(secret).digest("hex"),
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      } catch (error) {
        await safeWriteAuditLog({ level: "error", category: "api", event: "api_credential.rotation_failed", message: "Falha ao criar a credencial substituta ap\xF3s revoga\xE7\xE3o.", metadata: { previousCredentialId: id, consumerProject: current.consumer_project } });
        return res.status(500).json({ error: "credential_rotation_failed", message: "A chave anterior foi revogada, mas a nova emiss\xE3o falhou. Execute novamente a emiss\xE3o para este projeto." });
      }
      await safeWriteAuditLog({ category: "api", event: "api_credential.rotated", message: "Credencial de API rotacionada.", metadata: { previousCredentialId: id, credentialId: newId, consumerProject: current.consumer_project } });
      res.setHeader("Cache-Control", "no-store");
      return res.status(201).json({ data: { credentialId: newId, previousCredentialId: id, apiKey: secret, consumerName: current.consumer_name, consumerProject: current.consumer_project, revealOnce: true } });
    } catch {
      return res.status(500).json({ error: "credential_rotation_failed" });
    }
  });
  app.get("/api/v1/provisioning/credentials", async (req, res) => {
    if (!hasProvisioningAccess(req)) return res.status(401).json({ error: "provisioning_unauthorized" });
    try {
      res.setHeader("Cache-Control", "no-store");
      return res.json({ data: await listApiCredentials() });
    } catch {
      return res.status(500).json({ error: "credential_list_failed" });
    }
  });
  app.delete("/api/v1/provisioning/credentials/:id", async (req, res) => {
    if (!hasProvisioningAccess(req)) return res.status(401).json({ error: "provisioning_unauthorized" });
    try {
      const id = String(req.params.id);
      const revoked = await revokeApiCredential(id);
      if (!revoked) return res.status(404).json({ error: "active_credential_not_found" });
      await safeWriteAuditLog({ category: "api", event: "api_credential.revoked", message: "Credencial de API revogada.", metadata: { credentialId: id } });
      return res.status(200).json({ data: { credentialId: id, status: "revoked" } });
    } catch {
      return res.status(500).json({ error: "credential_revoke_failed" });
    }
  });
  app.use("/api/v1", async (req, res, next) => {
    if (req.path === "/health" && req.method === "GET") return next();
    try {
      const consumer = await authenticatedConsumer(req);
      if (!consumer) return res.status(401).json({ error: "unauthorized", message: "Informe uma chave de API v\xE1lida no cabe\xE7alho Authorization: Bearer." });
      req.mapscrapeConsumer = consumer;
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-MapScrape-Consumer", consumer.consumer_project);
      return next();
    } catch (error) {
      console.error("API credential lookup failed:", error instanceof Error ? error.message : "unknown");
      return res.status(503).json({ error: "authentication_unavailable" });
    }
  });
  app.get("/api/v1/projects", async (req, res) => {
    try {
      return res.json({ data: await listProjects(req.mapscrapeConsumer.consumer_project) });
    } catch (error) {
      return res.status(500).json({ error: "project_list_failed", message: error instanceof Error ? error.message : "Falha ao listar projetos." });
    }
  });
  app.post("/api/v1/projects", async (req, res) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (!name) return res.status(422).json({ error: "project_name_required" });
      const project = await resolveProject(req.mapscrapeConsumer.consumer_project, name);
      return res.status(201).json({ data: project });
    } catch (error) {
      return res.status(500).json({ error: "project_create_failed", message: error instanceof Error ? error.message : "Falha ao criar projeto." });
    }
  });
  app.patch("/api/v1/projects/:id", async (req, res) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (!name) return res.status(422).json({ error: "project_name_required", message: "O nome do projeto \xE9 obrigat\xF3rio." });
      const updated = await updateProject(req.mapscrapeConsumer.consumer_project, String(req.params.id), name);
      if (!updated) return res.status(404).json({ error: "project_not_found", message: "Projeto n\xE3o encontrado." });
      return res.json({ data: updated });
    } catch (error) {
      if (error.message === "project_name_conflict") return res.status(409).json({ error: "project_name_conflict", message: "J\xE1 existe um projeto com este nome." });
      return res.status(500).json({ error: "project_update_failed" });
    }
  });
  app.delete("/api/v1/projects/:id", async (req, res) => {
    try {
      const deleted = await deleteProject(req.mapscrapeConsumer.consumer_project, String(req.params.id));
      if (!deleted) return res.status(404).json({ error: "project_not_found", message: "Projeto n\xE3o encontrado." });
      return res.json({ data: { id: String(req.params.id), status: "deleted" } });
    } catch {
      return res.status(500).json({ error: "project_delete_failed" });
    }
  });
  app.get("/api/v1/categories", async (req, res) => {
    try {
      return res.json({ data: await listSearchCategories(req.mapscrapeConsumer.consumer_project) });
    } catch (error) {
      return res.status(500).json({ error: "category_list_failed", message: error instanceof Error ? error.message : "Falha ao listar categorias." });
    }
  });
  app.post("/api/v1/categories", async (req, res) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (!name) return res.status(422).json({ error: "category_name_required" });
      const category = await resolveSearchCategory(req.mapscrapeConsumer.consumer_project, name);
      return res.status(201).json({ data: category });
    } catch (error) {
      return res.status(500).json({ error: "category_create_failed", message: error instanceof Error ? error.message : "Falha ao criar categoria." });
    }
  });
  app.patch("/api/v1/categories/:id", async (req, res) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (!name) return res.status(422).json({ error: "category_name_required", message: "O nome da categoria \xE9 obrigat\xF3rio." });
      const updated = await updateSearchCategory(req.mapscrapeConsumer.consumer_project, String(req.params.id), name);
      if (!updated) return res.status(404).json({ error: "category_not_found", message: "Categoria n\xE3o encontrada." });
      return res.json({ data: updated });
    } catch (error) {
      if (error.message === "category_name_conflict") return res.status(409).json({ error: "category_name_conflict", message: "J\xE1 existe uma categoria com este nome." });
      return res.status(500).json({ error: "category_update_failed" });
    }
  });
  app.delete("/api/v1/categories/:id", async (req, res) => {
    try {
      const deleted = await deleteSearchCategory(req.mapscrapeConsumer.consumer_project, String(req.params.id));
      if (!deleted) return res.status(404).json({ error: "category_not_found", message: "Categoria n\xE3o encontrada." });
      return res.json({ data: { id: String(req.params.id), status: "deleted" } });
    } catch {
      return res.status(500).json({ error: "category_delete_failed" });
    }
  });
  app.get("/api/v1/leads", async (req, res) => {
    try {
      const limit = Number(req.query.limit ?? 50);
      const offset = Number(req.query.offset ?? 0);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) {
        return res.status(422).json({ error: "invalid_pagination", message: "limit deve ser inteiro entre 1 e 100 e offset deve ser inteiro >= 0." });
      }
      const result = await getPlaces({
        jobId: req.query.jobId ? String(req.query.jobId) : void 0,
        query: req.query.query ? String(req.query.query) : void 0,
        sortBy: req.query.sortBy ? String(req.query.sortBy) : void 0,
        sortOrder: req.query.sortOrder === "asc" ? "asc" : "desc",
        offset,
        limit,
        consumerProject: req.mapscrapeConsumer.consumer_project
      });
      return res.json({ data: result.places.map(apiLead), pagination: { total: result.total, limit, offset, hasMore: offset + result.places.length < result.total } });
    } catch (error) {
      return res.status(500).json({ error: "lead_query_failed", message: error instanceof Error ? error.message : "Falha ao consultar leads." });
    }
  });
  app.get("/api/v1/leads/:id", async (req, res) => {
    try {
      const records = await getPlacesByIds([String(req.params.id)], req.mapscrapeConsumer.consumer_project);
      if (!records.length) return res.status(404).json({ error: "lead_not_found", message: "Lead n\xE3o encontrado." });
      return res.json({ data: apiLead(records[0]) });
    } catch (error) {
      return res.status(500).json({ error: "lead_query_failed", message: error instanceof Error ? error.message : "Falha ao consultar lead." });
    }
  });
  app.post("/api/v1/jobs", async (req, res) => {
    try {
      const segment = typeof req.body?.segment === "string" ? req.body.segment.trim() : "";
      const location = typeof req.body?.location === "string" ? req.body.location.trim() : "";
      if (!segment || !location) return res.status(422).json({ error: "invalid_request", message: "segment e location s\xE3o obrigat\xF3rios." });
      const limit = Number(req.body?.limit ?? 20);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) return res.status(422).json({ error: "invalid_limit", message: "limit deve ser inteiro entre 1 e 100." });
      const scope = req.mapscrapeConsumer.consumer_project;
      const projectName = typeof req.body?.projectName === "string" && req.body.projectName.trim() ? req.body.projectName.trim() : `${segment} \xB7 ${location}`;
      const categoryName = typeof req.body?.categoryName === "string" && req.body.categoryName.trim() ? req.body.categoryName.trim() : segment;
      const project = await resolveProject(scope, projectName);
      const category = await resolveSearchCategory(scope, categoryName);
      const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const job = {
        id: jobId,
        user_id: scope,
        segment,
        project_name: project.name,
        project_id: project.id,
        category_id: category.id,
        location,
        limit_requested: limit,
        status: "running",
        status_message: "Coleta solicitada via API v1.",
        total_found: 0,
        total_collected: 0,
        total_duplicates: 0,
        total_errors: 0,
        current_step: "Preparando coleta",
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      await createJob(job);
      await safeWriteAuditLog({ category: "api", event: "api_v1.job_started", message: "Coleta iniciada via API v1.", jobId, metadata: { segment, location, limit } });
      const scrapePromise = runScraperJob(jobId, segment, location, limit, () => {
      }).catch(async (error) => {
        await safeWriteAuditLog({ level: "error", category: "api", event: "api_v1.job_failed", message: error instanceof Error ? error.message : "Falha na coleta.", jobId });
      });
      if (process.env.VERCEL) waitUntil(scrapePromise);
      return res.status(202).json({ data: { jobId, status: "running", statusUrl: `/api/v1/jobs/${jobId}`, resultsUrl: `/api/v1/jobs/${jobId}/results` } });
    } catch (error) {
      return res.status(500).json({ error: "job_start_failed", message: error instanceof Error ? error.message : "Falha ao iniciar coleta." });
    }
  });
  app.get("/api/v1/jobs/:id", async (req, res) => {
    try {
      const job = await getJob(String(req.params.id), req.mapscrapeConsumer.consumer_project);
      if (!job) return res.status(404).json({ error: "job_not_found", message: "Coleta n\xE3o encontrada." });
      return res.json({ data: { ...job, isRunning: isJobRunning(job.id) } });
    } catch (error) {
      return res.status(500).json({ error: "job_query_failed", message: error instanceof Error ? error.message : "Falha ao consultar coleta." });
    }
  });
  app.get("/api/v1/jobs/:id/results", async (req, res) => {
    try {
      const job = await getJob(String(req.params.id), req.mapscrapeConsumer.consumer_project);
      if (!job) return res.status(404).json({ error: "job_not_found", message: "Coleta n\xE3o encontrada." });
      const limit = Number(req.query.limit ?? 50);
      const offset = Number(req.query.offset ?? 0);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) return res.status(422).json({ error: "invalid_pagination", message: "Par\xE2metros de pagina\xE7\xE3o inv\xE1lidos." });
      const result = await getPlaces({ jobId: job.id, limit, offset, sortBy: "collected_at", sortOrder: "desc", consumerProject: req.mapscrapeConsumer.consumer_project });
      return res.json({ data: result.places.map(apiLead), pagination: { total: result.total, limit, offset, hasMore: offset + result.places.length < result.total } });
    } catch (error) {
      return res.status(500).json({ error: "job_results_failed", message: error instanceof Error ? error.message : "Falha ao consultar resultados." });
    }
  });
  if (isDev) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
    console.log("Vite middleware attached in development mode.");
  } else if (!process.env.VERCEL) {
    const distPath = path3.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path3.resolve(distPath, "index.html"));
    });
  }
  return app;
}
if (!process.env.VERCEL) {
  createApp().then((app) => {
    const PORT = Number(process.env.PORT) || 3e3;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`MapScrape server running on http://0.0.0.0:${PORT}`);
    });
  }).catch((err) => {
    console.error("Fatal server startup error:", err);
    process.exit(1);
  });
}
export {
  createApp
};
