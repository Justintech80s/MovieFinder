-- Incremental MovieFinder core schema migration.
-- This extends the existing movies/people/credits/availability and Cinema Graph
-- structures. It intentionally does not drop or rebuild existing data.

create extension if not exists pgcrypto;

-- One people table represents actors, directors, writers, and producers.
-- Extend the existing credits role contract to include writers.
alter table if exists public.credits drop constraint if exists credits_role_check;
alter table if exists public.credits
  add constraint credits_role_check
  check (role in ('cast', 'director', 'producer', 'writer'));

create table if not exists public.genres (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.movie_genres (
  movie_id uuid not null references public.movies(id) on delete cascade,
  genre_id uuid not null references public.genres(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (movie_id, genre_id)
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_type text,
  source text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_companies_source_external
  on public.companies (source, external_id)
  where source is not null and external_id is not null;
create index if not exists idx_companies_name on public.companies (lower(name));

create table if not exists public.movie_companies (
  movie_id uuid not null references public.movies(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  relationship_type text not null default 'production',
  created_at timestamptz not null default now(),
  primary key (movie_id, company_id, relationship_type)
);

create table if not exists public.streaming_services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  homepage_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep availability_snapshots as the authoritative current/historical
-- availability table. This mapping lets snapshots resolve to normalized services.
alter table if exists public.availability_snapshots
  add column if not exists streaming_service_id uuid references public.streaming_services(id) on delete set null;

create index if not exists idx_availability_streaming_service
  on public.availability_snapshots (streaming_service_id, region, status, source_checked_at desc);

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  query text not null,
  parsed_intent jsonb not null default '{}'::jsonb,
  result_count integer check (result_count is null or result_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_search_history_user_created
  on public.search_history (user_id, created_at desc);

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.movies(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  source text not null default 'user',
  score numeric(6,3) not null,
  scale_max numeric(6,3) not null default 10,
  review text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (score >= 0 and scale_max > 0 and score <= scale_max)
);

create unique index if not exists idx_ratings_user_movie
  on public.ratings (user_id, movie_id)
  where user_id is not null and source = 'user';
create index if not exists idx_ratings_movie_source
  on public.ratings (movie_id, source);

-- Preserve the existing Cinema Graph relationship model. This statement is a
-- no-op on current MovieFinder databases where cinema_relations already exists.
create table if not exists public.cinema_relations (
  id uuid primary key default gen_random_uuid(),
  from_entity_id uuid not null references public.cinema_entities(id) on delete cascade,
  to_entity_id uuid not null references public.cinema_entities(id) on delete cascade,
  relation_type text not null,
  properties jsonb not null default '{}'::jsonb,
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (from_entity_id, relation_type, to_entity_id)
);

-- Public-schema tables are backend-managed by default. RLS prevents accidental
-- browser access; the server-side service role remains the trusted write path.
alter table public.genres enable row level security;
alter table public.movie_genres enable row level security;
alter table public.companies enable row level security;
alter table public.movie_companies enable row level security;
alter table public.streaming_services enable row level security;
alter table public.users enable row level security;
alter table public.search_history enable row level security;
alter table public.ratings enable row level security;
alter table public.cinema_relations enable row level security;

-- Also harden the existing core catalog tables now that this migration defines
-- the unified backend database boundary.
alter table public.people enable row level security;
alter table public.movies enable row level security;
alter table public.credits enable row level security;
alter table public.availability_snapshots enable row level security;
