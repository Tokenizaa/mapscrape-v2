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
  ensureUserProfile: () => ensureUserProfile,
  findActiveApiCredential: () => findActiveApiCredential,
  findPlaceByUrl: () => findPlaceByUrl,
  findUserByEmail: () => findUserByEmail,
  findUserById: () => findUserById,
  getAllPlaces: () => getAllPlaces,
  getAuthenticatedUser: () => getAuthenticatedUser,
  getCurrentSupabaseUser: () => getCurrentSupabaseUser,
  getJob: () => getJob,
  getPlaces: () => getPlaces,
  getPlacesByIds: () => getPlacesByIds,
  getRunReport: () => getRunReport,
  getSession: () => getSession,
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
import { createClient } from "@supabase/supabase-js";
function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) {
      throw new Error(
        "Database n\xE3o configurada: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente (chave de servi\xE7o, apenas servidor)."
      );
    }
    supabase = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });
  }
  return supabase;
}
async function getCurrentSupabaseUser() {
  const db = getSupabase();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
async function getSession() {
  const db = getSupabase();
  return db.auth.getSession();
}
async function findUserById(id) {
  const db = getSupabase();
  const { data, error } = await db.from("users").select("*").eq("id", id).single();
  if (error || !data) return null;
  return data;
}
async function findUserByEmail(email) {
  const db = getSupabase();
  const { data, error } = await db.from("users").select("*").eq("email", email.toLowerCase()).single();
  if (error || !data) return null;
  return data;
}
async function getAuthenticatedUser() {
  const result = await getSession();
  if ("error" in result) {
    return null;
  }
  const session = result.session;
  if (!session?.user) return null;
  return findUserById(session.user.id);
}
async function ensureUserProfile(email, name) {
  const existing = await findUserByEmail(email);
  if (existing) return existing;
  const userId = `user_${email.replace(/[^a-z0-9]/g, "_").replace(/_+$/, "")}`;
  await createUser({
    id: userId,
    email,
    displayName: name || email.split("@")[0],
    passwordHash: "",
    // Supabase Auth handles password verification
    role: "user",
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  return findUserByEmail(email);
}
async function createUser(input) {
  const db = getSupabase();
  const { error } = await db.from("users").insert({
    id: input.id,
    email: input.email.toLowerCase(),
    display_name: input.displayName,
    password_hash: input.passwordHash,
    role: input.role,
    created_at: input.createdAt
  });
  if (error) throw new Error(`Erro ao criar usu\xE1rio: ${error.message}`);
}
async function updateUserLogin(id, timestamp) {
  const db = getSupabase();
  const { error } = await db.from("users").update({ last_login_at: timestamp }).eq("id", id);
  if (error) throw new Error(`Erro ao atualizar login: ${error.message}`);
}
async function createApiCredential(input) {
  const db = getSupabase();
  const { error } = await db.from("api_credentials").insert({
    id: input.id,
    consumer_name: input.consumerName,
    consumer_project: input.consumerProject,
    key_hash: input.keyHash,
    status: "active",
    created_at: input.createdAt,
    last_used_at: null,
    revoked_at: null
  });
  if (error) throw new Error(`Erro ao criar credencial API: ${error.message}`);
}
async function findActiveApiCredential(keyHash) {
  const db = getSupabase();
  const { data, error } = await db.from("api_credentials").select("id, consumer_project").eq("key_hash", keyHash).eq("status", "active").single();
  if (error || !data) return null;
  await db.from("api_credentials").update({ last_used_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", data.id);
  return { id: data.id, consumer_project: data.consumer_project };
}
async function revokeApiCredential(id, consumerProject) {
  const db = getSupabase();
  const { error, data } = await db.from("api_credentials").update({ status: "revoked", revoked_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id).select("status").single();
  if (error) return false;
  return data?.status === "revoked";
}
async function listApiCredentials() {
  const db = getSupabase();
  const { data, error } = await db.from("api_credentials").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
async function createJob(job) {
  const db = getSupabase();
  const { error } = await db.from("searches").insert({
    id: job.id,
    user_id: job.user_id,
    segment: job.segment,
    project_name: job.project_name || `${job.segment} \xB7 ${job.location}`,
    project_id: job.project_id || null,
    category_id: job.category_id || null,
    location: job.location,
    limit_requested: job.limit_requested,
    status: job.status,
    status_message: job.status_message,
    total_found: job.total_found,
    total_collected: job.total_collected,
    total_duplicates: job.total_duplicates,
    total_errors: job.total_errors,
    current_step: job.current_step || "",
    created_at: job.created_at,
    completed_at: job.completed_at || null
  });
  if (error) throw new Error(`Erro ao criar job: ${error.message}`);
}
async function updateJobProgress(id, updates) {
  const db = getSupabase();
  const { error } = await db.from("searches").update(updates).eq("id", id);
  if (error) throw new Error(`Erro ao atualizar job: ${error.message}`);
}
async function getJob(id, userId) {
  const db = getSupabase();
  let query = db.from("searches").select("*").eq("id", id);
  if (userId) {
    query = query.eq("user_id", userId);
  }
  const { data, error } = await query.single();
  if (error || !data) return null;
  return data;
}
async function listJobs(userId) {
  const db = getSupabase();
  let query = db.from("searches").select("*");
  if (userId) {
    query = query.eq("user_id", userId);
  }
  query = query.order("created_at", { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
async function deleteJob(id, userId) {
  const db = getSupabase();
  await db.from("places").delete().eq("job_id", id);
  const { error } = await db.from("searches").delete().eq("id", id);
  if (error) return false;
  return true;
}
async function insertPlace(place) {
  const db = getSupabase();
  const { error } = await db.from("places").insert({
    id: place.id,
    job_id: place.job_id,
    name: place.name,
    category: place.category,
    address: place.address,
    phone: place.phone,
    website: place.website,
    rating: place.rating,
    review_count: place.review_count,
    price_range: place.price_range,
    opening_hours: place.opening_hours,
    business_status: place.business_status,
    latitude: place.latitude,
    longitude: place.longitude,
    maps_url: place.maps_url,
    description: place.description,
    services_attributes: place.services_attributes,
    photos: place.photos || "",
    videos: place.videos || "",
    logo_url: place.logo_url || "",
    booking_url: place.booking_url || "",
    social_links: place.social_links || "",
    reviews: place.reviews || "[]",
    review_topics: place.review_topics || "[]",
    additional_attributes: place.additional_attributes || "{}",
    media_items: place.media_items || "[]",
    plus_code: place.plus_code || "",
    attributes: place.attributes || "[]",
    accessibility_attributes: place.accessibility_attributes || "[]",
    next_opening_text: place.next_opening_text || "",
    next_open_day: place.next_open_day || "",
    next_open_time: place.next_open_time || "",
    visible_photos_count: place.visible_photos_count || "",
    postal_code: place.postal_code || "",
    country: place.country || "",
    city: place.city || "",
    state: place.state || "",
    source_place_id: place.source_place_id || "",
    source_url: place.source_url || place.maps_url || "",
    popular_times: place.popular_times || "{}",
    rating_distribution: place.rating_distribution || "{}",
    review_highlights: place.review_highlights || "[]",
    field_status: place.field_status || "{}",
    collected_at: place.collected_at
  });
  if (error) throw new Error(`Erro ao inserir lugar: ${error.message}`);
}
async function updatePlace(id, place) {
  const db = getSupabase();
  const { error } = await db.from("places").update({
    name: place.name,
    category: place.category,
    address: place.address,
    phone: place.phone,
    website: place.website,
    rating: place.rating,
    review_count: place.review_count,
    price_range: place.price_range,
    opening_hours: place.opening_hours,
    business_status: place.business_status,
    latitude: place.latitude,
    longitude: place.longitude,
    maps_url: place.maps_url,
    description: place.description,
    services_attributes: place.services_attributes,
    photos: place.photos || "",
    videos: place.videos || "",
    logo_url: place.logo_url || "",
    booking_url: place.booking_url || "",
    social_links: place.social_links || "",
    reviews: place.reviews || "[]",
    review_topics: place.review_topics || "[]",
    additional_attributes: place.additional_attributes || "{}",
    media_items: place.media_items || "[]",
    plus_code: place.plus_code || "",
    attributes: place.attributes || "[]",
    accessibility_attributes: place.accessibility_attributes || "[]",
    next_opening_text: place.next_opening_text || "",
    next_open_day: place.next_open_day || "",
    next_open_time: place.next_open_time || "",
    visible_photos_count: place.visible_photos_count || "",
    postal_code: place.postal_code || "",
    country: place.country || "",
    city: place.city || "",
    state: place.state || "",
    source_place_id: place.source_place_id || "",
    source_url: place.source_url || place.maps_url || "",
    popular_times: place.popular_times || "{}",
    rating_distribution: place.rating_distribution || "{}",
    review_highlights: place.review_highlights || "[]",
    field_status: place.field_status || "{}",
    collected_at: place.collected_at
  }).eq("id", id);
  if (error) throw new Error(`Erro ao atualizar lugar: ${error.message}`);
}
async function findPlaceByUrl(url, consumerProject) {
  if (!url || !url.trim()) return null;
  const cleanUrl = url.trim().split("?")[0].replace(/\/$/, "");
  if (!cleanUrl) return null;
  const db = getSupabase();
  const { data, error } = await db.from("places").select("*").eq("maps_url", cleanUrl).single();
  if (error || !data) return null;
  if (consumerProject) {
    const { data: jobData, error: jobError } = await db.from("searches").select("user_id").eq("id", data.job_id).single();
    if (jobError || jobData?.user_id !== consumerProject) {
      return null;
    }
  }
  return data;
}
async function placeExistsByUrl(url, _jobId) {
  return await findPlaceByUrl(url) !== null;
}
async function getPlaces(options) {
  const db = getSupabase();
  const sortBy = options.sortBy || "collected_at";
  const ascending = options.sortOrder === "asc";
  const limit = Math.max(1, Math.min(100, options.limit ?? 50));
  const offset = Math.max(0, options.offset ?? 0);
  let allowedJobIds = null;
  if (options.consumerProject) {
    const { data: userJobs, error: jobsError } = await db.from("searches").select("id").eq("user_id", options.consumerProject);
    if (jobsError) throw jobsError;
    allowedJobIds = (userJobs ?? []).map((j) => j.id);
    if (allowedJobIds.length === 0) {
      return { places: [], total: 0 };
    }
  }
  let query = db.from("places").select("*", { count: "exact" });
  if (options.jobId) {
    query = query.eq("job_id", options.jobId);
  }
  if (allowedJobIds) {
    query = query.in("job_id", allowedJobIds);
  }
  if (options.query && options.query.trim()) {
    const q = String(options.query.trim());
    query = query.or(`name.ilike.%${q}%,category.ilike.%${q}%,address.ilike.%${q}%,phone.ilike.%${q}%,website.ilike.%${q}%`);
  }
  if (options.category && options.category.trim()) {
    query = query.ilike("category", `%${String(options.category.trim())}%`);
  }
  query = query.order(sortBy, { ascending });
  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) throw error;
  return {
    places: data ?? [],
    total: count ?? 0
  };
}
async function getPlacesByIds(ids, consumerProject) {
  if (ids.length === 0) return [];
  const db = getSupabase();
  let query = db.from("places").select("*").in("id", ids);
  if (consumerProject) {
    const { data: userJobs, error: jobsError } = await db.from("searches").select("id").eq("user_id", consumerProject);
    if (jobsError) return [];
    const userJobIds = userJobs?.map((j) => j.id) || [];
    if (userJobIds.length === 0) return [];
    const { data: userPlaces, error: placesError } = await db.from("places").select("id").in("job_id", userJobIds);
    if (placesError) return [];
    const userPlaceIds = userPlaces?.map((p) => p.id) || [];
    const filteredIds = ids.filter((id) => userPlaceIds.includes(id));
    if (filteredIds.length === 0) return [];
    query = db.from("places").select("*").in("id", filteredIds);
  }
  const { data, error } = await query.order("collected_at", { ascending: false });
  if (error) throw error;
  return data;
}
async function getAllPlaces(jobId, consumerProject) {
  const db = getSupabase();
  let query = db.from("places").select("*");
  if (jobId) {
    query = query.eq("job_id", jobId);
  }
  if (consumerProject) {
    const { data: userJobs, error: jobsError } = await db.from("searches").select("id").eq("user_id", consumerProject);
    if (jobsError) return [];
    const userJobIds = userJobs?.map((j) => j.id) || [];
    if (userJobIds.length === 0) return [];
    query = db.from("places").select("*").in("job_id", userJobIds);
  }
  const { data, error } = await query.order("collected_at", { ascending: false });
  if (error) throw error;
  return data;
}
async function listPlaceCategories(consumerProject) {
  const db = getSupabase();
  let query = db.from("places").select("category").gt("category", "");
  if (consumerProject) {
    const { data: userJobs, error: jobsError } = await db.from("searches").select("id").eq("user_id", consumerProject);
    if (jobsError) return [];
    const userJobIds = userJobs?.map((j) => j.id) || [];
    if (userJobIds.length === 0) return [];
    const { data: userPlaces, error: placesError } = await db.from("places").select("category").in("job_id", userJobIds);
    if (placesError) return [];
    const categories2 = userPlaces?.map((p) => String(p.category || "")).filter(Boolean) || [];
    return [...new Set(categories2)];
  }
  const { data, error } = await query;
  if (error) throw error;
  const categories = data?.map((row) => String(row.category || "")).filter(Boolean) || [];
  return [...new Set(categories)];
}
async function countPlaces() {
  const db = getSupabase();
  const { count, error } = await db.from("places").select("*", { count: "exact", head: true });
  if (error) throw error;
  return count || 0;
}
async function listProjects(consumerProject, userId) {
  const db = getSupabase();
  const { data, error } = await db.from("projects").select("*").eq("consumer_project", consumerProject).eq("user_id", userId).order("name", { ascending: false });
  if (error) throw error;
  return data;
}
async function resolveProject(consumerProject, name, userId) {
  const canonicalName = name.trim().replace(/\s+/g, " ").slice(0, 120);
  const normalized = canonicalName.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
  if (!normalized) throw new Error("project_name_required");
  const db = getSupabase();
  const { data, error } = await db.from("projects").select("*").eq("consumer_project", consumerProject).eq("normalized_name", normalized).single();
  if (error || !data) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const record = {
      id: `prj_${Math.random().toString(36).substring(2, 9)}`,
      consumer_project: consumerProject,
      name: canonicalName,
      normalized_name: normalized,
      user_id: userId,
      created_at: now,
      updated_at: now
    };
    const { error: insertError } = await db.from("projects").insert(record);
    if (insertError) throw new Error(`Erro ao criar projeto: ${insertError.message}`);
    return record;
  }
  return data;
}
async function updateProject(consumerProject, id, name, userId) {
  const canonicalName = name.trim().replace(/\s+/g, " ").slice(0, 120);
  const normalized = canonicalName.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
  if (!normalized) throw new Error("project_name_required");
  const db = getSupabase();
  const { data: existing, error: existError } = await db.from("projects").select("*").eq("id", id).eq("consumer_project", consumerProject).eq("user_id", userId).single();
  if (existError || !existing) return null;
  const { data: conflict, error: conflictError } = await db.from("projects").select("*").eq("consumer_project", consumerProject).eq("normalized_name", normalized).neq("id", id).single();
  if (conflictError || conflict) throw new Error("project_name_conflict");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const { error: updateError } = await db.from("projects").update({ name: canonicalName, normalized_name: normalized, updated_at: now }).eq("id", id).eq("consumer_project", consumerProject).eq("user_id", userId);
  if (updateError) throw new Error(`Erro ao atualizar projeto: ${updateError.message}`);
  const { data: updated, error: updatedError } = await db.from("projects").select("*").eq("id", id).eq("consumer_project", consumerProject).eq("user_id", userId).single();
  if (updatedError) throw new Error(`Erro ao buscar projeto atualizado: ${updatedError.message}`);
  return updated;
}
async function deleteProject(consumerProject, id, userId) {
  const db = getSupabase();
  const { error } = await db.from("projects").delete().eq("id", id).eq("consumer_project", consumerProject).eq("user_id", userId);
  if (error) return false;
  await db.from("searches").update({ project_id: null }).eq("project_id", id);
  return true;
}
async function listSearchCategories(consumerProject, userId) {
  const db = getSupabase();
  const { data, error } = await db.from("search_categories").select("*").eq("consumer_project", consumerProject).eq("user_id", userId).order("name", { ascending: false });
  if (error) throw error;
  return data;
}
async function resolveSearchCategory(consumerProject, name, userId) {
  const canonicalName = name.trim().replace(/\s+/g, " ").slice(0, 120);
  const normalized = canonicalName.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
  if (!normalized) throw new Error("category_name_required");
  const db = getSupabase();
  const { data, error } = await db.from("search_categories").select("*").eq("consumer_project", consumerProject).eq("normalized_name", normalized).single();
  if (error || !data) {
    const record = {
      id: `cat_${Math.random().toString(36).substring(2, 9)}`,
      consumer_project: consumerProject,
      name: canonicalName,
      normalized_name: normalized,
      user_id: userId,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const { error: insertError } = await db.from("search_categories").insert(record);
    if (insertError) throw new Error(`Erro ao criar categoria: ${insertError.message}`);
    return record;
  }
  return data;
}
async function updateSearchCategory(consumerProject, id, name, userId) {
  const canonicalName = name.trim().replace(/\s+/g, " ").slice(0, 120);
  const normalized = canonicalName.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
  if (!normalized) throw new Error("category_name_required");
  const db = getSupabase();
  const { data: existing, error: existError } = await db.from("search_categories").select("*").eq("id", id).eq("consumer_project", consumerProject).eq("user_id", userId).single();
  if (existError || !existing) return null;
  const { data: conflict, error: conflictError } = await db.from("search_categories").select("*").eq("consumer_project", consumerProject).eq("normalized_name", normalized).neq("id", id).single();
  if (conflictError || conflict) throw new Error("category_name_conflict");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const { error: updateError } = await db.from("search_categories").update({ name: canonicalName, normalized_name: normalized }).eq("id", id).eq("consumer_project", consumerProject).eq("user_id", userId);
  if (updateError) throw new Error(`Erro ao atualizar categoria: ${updateError.message}`);
  const { data: updated, error: updatedError } = await db.from("search_categories").select("*").eq("id", id).eq("consumer_project", consumerProject).eq("user_id", userId).single();
  if (updatedError) throw new Error(`Erro ao buscar categoria atualizada: ${updatedError.message}`);
  return updated;
}
async function deleteSearchCategory(consumerProject, id, userId) {
  const db = getSupabase();
  const { error } = await db.from("search_categories").delete().eq("id", id).eq("consumer_project", consumerProject).eq("user_id", userId);
  if (error) return false;
  await db.from("searches").update({ category_id: null }).eq("category_id", id);
  return true;
}
async function saveRunReport(jobId, reportJson, generatedAt, userId) {
  const db = getSupabase();
  const { error } = await db.from("run_reports").upsert({
    job_id: jobId,
    report_json: reportJson,
    generated_at: generatedAt
  }, { onConflict: "job_id" });
  if (error) throw new Error(`Erro ao salvar relat\xF3rio: ${error.message}`);
}
async function getRunReport(jobId) {
  const db = getSupabase();
  const { data, error } = await db.from("run_reports").select("report_json").eq("job_id", jobId).single();
  if (error || !data) return null;
  if (typeof data.report_json === "string" && data.report_json.startsWith("gzip-base64:")) {
    const { gunzipSync } = await import("node:zlib");
    return gunzipSync(Buffer.from(data.report_json.slice("gzip-base64:".length), "base64")).toString("utf8");
  }
  return data.report_json;
}
async function countUsers() {
  const db = getSupabase();
  const { count, error } = await db.from("users").select("*", { count: "exact", head: true });
  if (error) throw error;
  return count || 0;
}
async function initDb() {
  console.log("Supabase initialization checked - tables should exist in database.");
}
var supabase;
var init_db = __esm({
  "src/server/db.ts"() {
    supabase = null;
  }
});

// server.ts
init_db();
import "dotenv/config";
import express from "express";

// src/server/audit-log.ts
import { createClient as createClient2 } from "@supabase/supabase-js";
var supabase2 = null;
function getSupabase2() {
  if (!supabase2) {
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) {
      throw new Error("Supabase n\xE3o configurado: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
    }
    supabase2 = createClient2(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });
  }
  return supabase2;
}
async function initAuditLog() {
  let db;
  try {
    db = getSupabase2();
  } catch {
    console.log("Supabase n\xE3o configurado: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para ativar logs de auditoria.");
    return;
  }
  const { error } = await db.from("audit_logs").select("*", { count: "exact", head: true });
  if (error) {
    console.log("Tabela audit_logs deve existir no Supabase (criar via dashboard ou migration).");
  }
}

// server.ts
async function createApp() {
  await initDb();
  await initAuditLog();
  const app = express();
  app.use(express.json());
  app.get("/api/health", async (_req, res) => {
    try {
      const { countPlaces: countPlaces2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      const totalPlaces = await countPlaces2();
      res.json({ status: "ok", database: "connected", totalPlaces, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    } catch (error) {
      res.status(503).json({ status: "degraded", database: "unavailable" });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    console.log("Development mode - API routes handled by api/ directory");
  }
  return app;
}
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  createApp().then((app) => {
    const port = Number(process.env.PORT) || 3e3;
    app.listen(port, "0.0.0.0", () => {
      console.log(`MapScrape API server running on http://0.0.0.0:${port}`);
    });
  }).catch((err) => {
    console.error("Server startup error:", err);
    process.exit(1);
  });
}
export {
  createApp
};
