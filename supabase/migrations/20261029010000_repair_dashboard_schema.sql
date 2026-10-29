-- Safe additive repair migration for the production dashboard API.
-- Does not drop or truncate any existing table or record.
create extension if not exists pgcrypto;

create table if not exists public.users (
  id text primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null default '',
  role text not null default 'user',
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.searches (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  segment text not null default '',
  project_name text not null default '',
  location text not null default '',
  limit_requested integer not null default 0,
  status text not null default 'queued',
  status_message text not null default '',
  total_found integer not null default 0,
  total_collected integer not null default 0,
  total_duplicates integer not null default 0,
  total_errors integer not null default 0,
  current_step text default '',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  project_id text,
  category_id text
);

create table if not exists public.places (
  id text primary key,
  job_id text not null references public.searches(id) on delete cascade,
  name text not null default '',
  category text not null default '',
  address text not null default '',
  phone text not null default '',
  website text not null default '',
  rating text not null default '',
  review_count text not null default '',
  price_range text not null default '',
  business_status text not null default '',
  opening_hours text not null default '',
  latitude text not null default '',
  longitude text not null default '',
  maps_url text not null default '',
  description text not null default '',
  services_attributes text not null default '',
  photos text default '',
  videos text default '',
  logo_url text default '',
  booking_url text default '',
  social_links text default '',
  reviews text default '[]',
  review_topics text default '[]',
  additional_attributes text default '{}',
  media_items text default '[]',
  plus_code text default '',
  attributes text default '[]',
  accessibility_attributes text default '[]',
  next_opening_text text default '',
  next_open_day text default '',
  next_open_time text default '',
  visible_photos_count text default '',
  postal_code text default '',
  country text default '',
  city text default '',
  state text default '',
  source_place_id text default '',
  source_url text default '',
  popular_times text default '{}',
  rating_distribution text default '{}',
  review_highlights text default '[]',
  field_status text default '{}',
  collected_at timestamptz not null default now()
);

alter table public.searches add column if not exists project_name text not null default '';
alter table public.searches add column if not exists project_id text;
alter table public.searches add column if not exists category_id text;
alter table public.searches add column if not exists total_found integer not null default 0;
alter table public.searches add column if not exists total_collected integer not null default 0;
alter table public.searches add column if not exists total_duplicates integer not null default 0;
alter table public.searches add column if not exists total_errors integer not null default 0;
alter table public.searches add column if not exists status_message text not null default '';
alter table public.places add column if not exists collected_at timestamptz not null default now();
alter table public.places add column if not exists category text not null default '';
alter table public.places add column if not exists address text not null default '';
alter table public.places add column if not exists phone text not null default '';
alter table public.places add column if not exists website text not null default '';
alter table public.places add column if not exists rating text not null default '';
alter table public.places add column if not exists review_count text not null default '';

create table if not exists public.projects (
  id text primary key,
  consumer_project text not null,
  name text not null,
  normalized_name text not null,
  user_id text not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (consumer_project, normalized_name)
);
create table if not exists public.search_categories (
  id text primary key,
  consumer_project text not null,
  name text not null,
  normalized_name text not null,
  user_id text not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (consumer_project, normalized_name)
);
create table if not exists public.audit_logs (
  id text primary key,
  created_at timestamptz not null default now(),
  level text not null default 'info',
  category text not null default 'system',
  event text not null default '',
  message text not null default '',
  job_id text not null default '',
  metadata text not null default '{}'
);
create table if not exists public.run_reports (
  job_id text primary key references public.searches(id) on delete cascade,
  report_json text not null,
  generated_at timestamptz not null default now()
);
create table if not exists public.api_credentials (
  id text primary key,
  consumer_name text not null,
  consumer_project text not null,
  key_hash text not null unique,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  user_id text references public.users(id) on delete set null
);

create index if not exists idx_searches_user_id on public.searches(user_id);
create index if not exists idx_places_job_id on public.places(job_id);
create index if not exists idx_projects_user_id on public.projects(user_id);
create index if not exists idx_search_categories_user_id on public.search_categories(user_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);

-- Ensure new Supabase Auth accounts get the profile row required by legacy foreign keys.
create or replace function public.mapscrape_sync_auth_profile()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.users (id, email, display_name, role, created_at)
  values (new.id::text, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''),'@',1)), 'user', now())
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
drop trigger if exists mapscrape_auth_profile_sync on auth.users;
create trigger mapscrape_auth_profile_sync
after insert on auth.users
for each row execute function public.mapscrape_sync_auth_profile();

alter table public.users enable row level security;
alter table public.searches enable row level security;
alter table public.places enable row level security;
alter table public.projects enable row level security;
alter table public.search_categories enable row level security;
alter table public.audit_logs enable row level security;
alter table public.run_reports enable row level security;
alter table public.api_credentials enable row level security;

-- The API uses server-side Supabase credentials; direct browser access remains denied by RLS.
