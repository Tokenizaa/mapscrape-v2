-- Migration: 20261029010000_repair_dashboard_schema.sql
-- Cria (idempotente) as tabelas do MapScrape v2 no Supabase.
-- Não usa DROP TABLE / TRUNCATE: compatível com dados existentes.
-- Aplique apenas no projeto Supabase do MapScrape (não em bancos de outros produtos).

-- Extensões (opcional; IDs são TEXT, mantida por compatibilidade com seed)
CREATE EXTENSION IF NOT EXISTS "uuid-ossl";

-- Função auxiliar para updated_at
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Table: users (perfis vinculados ao Supabase Auth)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

-- ============================================================================
-- Table: searches (jobs / coletas)
-- ============================================================================
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
  completed_at TEXT,
  project_id TEXT,
  category_id TEXT
);

-- ============================================================================
-- Table: places (resultados da coleta)
-- ============================================================================
CREATE TABLE IF NOT EXISTS places (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  rating TEXT NOT NULL DEFAULT '',
  review_count TEXT NOT NULL DEFAULT '',
  price_range TEXT NOT NULL DEFAULT '',
  business_status TEXT NOT NULL DEFAULT '',
  opening_hours TEXT NOT NULL DEFAULT '',
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
  collected_at TEXT NOT NULL
);

-- ============================================================================
-- Table: api_credentials (chaves de consumidor/integração externa)
-- ============================================================================
CREATE TABLE IF NOT EXISTS api_credentials (
  id TEXT PRIMARY KEY,
  consumer_name TEXT NOT NULL,
  consumer_project TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================================
-- Table: projects (organização do consumidor)
-- ============================================================================
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  consumer_project TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (consumer_project, normalized_name)
);

-- ============================================================================
-- Table: search_categories (categorias de pesquisa do consumidor)
-- ============================================================================
CREATE TABLE IF NOT EXISTS search_categories (
  id TEXT PRIMARY KEY,
  consumer_project TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (consumer_project, normalized_name)
);

-- ============================================================================
-- Table: run_reports (relatórios de execução)
-- ============================================================================
CREATE TABLE IF NOT EXISTS run_reports (
  job_id TEXT PRIMARY KEY REFERENCES searches(id) ON DELETE CASCADE,
  report_json TEXT NOT NULL,
  generated_at TEXT NOT NULL
);

-- ============================================================================
-- Table: audit_logs (logs de auditoria)
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  category TEXT NOT NULL,
  event TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  job_id TEXT DEFAULT '',
  metadata TEXT NOT NULL DEFAULT '{}'
);

-- ============================================================================
-- Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_searches_user_id ON searches (user_id);
CREATE INDEX IF NOT EXISTS idx_places_job_id ON places (job_id);
CREATE INDEX IF NOT EXISTS idx_places_maps_url ON places (maps_url);
CREATE INDEX IF NOT EXISTS idx_api_credentials_status ON api_credentials (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_credentials_active_project
  ON api_credentials (consumer_project) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_projects_scope ON projects (consumer_project, normalized_name);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects (user_id);
CREATE INDEX IF NOT EXISTS idx_search_categories_scope ON search_categories (consumer_project, normalized_name);
CREATE INDEX IF NOT EXISTS idx_search_categories_user_id ON search_categories (user_id);
CREATE INDEX IF NOT EXISTS idx_run_reports_job_id ON run_reports (job_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_job_id ON audit_logs (job_id);

-- ============================================================================
-- Triggers de updated_at
-- ============================================================================
DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS search_categories_updated_at ON search_categories;
CREATE TRIGGER search_categories_updated_at
  BEFORE UPDATE ON search_categories
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

-- ============================================================================
-- Observação sobre RLS
-- ============================================================================
-- As políticas de Row Level Security (RLS) devem ser habilitadas por tabela no
-- dashboard do Supabase (ou via migration separada) para isolar dados por user_id
-- em produção. O isolamento de dados também é imposto no código das rotas v1
-- (consumer_project / user_id do escopo autenticado).
