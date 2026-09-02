create extension if not exists pgcrypto;

create table if not exists cinema_entities (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  canonical_key text not null unique,
  name text not null,
  description text,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cinema_entity_sources (
  entity_id uuid not null references cinema_entities(id) on delete cascade,
  source text not null,
  external_id text not null,
  source_url text,
  retrieved_at timestamptz not null default now(),
  payload_hash text,
  primary key (entity_id, source, external_id),
  unique (source, external_id)
);

create table if not exists cinema_relations (
  id uuid primary key default gen_random_uuid(),
  from_entity_id uuid not null references cinema_entities(id) on delete cascade,
  to_entity_id uuid not null references cinema_entities(id) on delete cascade,
  relation_type text not null,
  properties jsonb not null default '{}'::jsonb,
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (from_entity_id, relation_type, to_entity_id)
);

create table if not exists cinema_relation_sources (
  relation_id uuid not null references cinema_relations(id) on delete cascade,
  source text not null,
  external_id text not null,
  source_url text,
  retrieved_at timestamptz not null default now(),
  primary key (relation_id, source, external_id),
  unique (relation_id, source, external_id)
);

create table if not exists cinema_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  job_type text not null,
  seed_external_id text,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  checkpoint jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cinema_entities_type_name
  on cinema_entities (entity_type, lower(name));
create index if not exists idx_cinema_entity_sources_lookup
  on cinema_entity_sources (source, external_id);
create index if not exists idx_cinema_relations_from_type
  on cinema_relations (from_entity_id, relation_type);
create index if not exists idx_cinema_relations_to_type
  on cinema_relations (to_entity_id, relation_type);
create index if not exists idx_cinema_ingestion_jobs_resume
  on cinema_ingestion_jobs (source, job_type, seed_external_id, status, updated_at desc);
