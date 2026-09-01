create extension if not exists pgcrypto;

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);

create table if not exists movies (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  title text not null,
  release_year integer,
  imdb_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);

create table if not exists credits (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  movie_id uuid not null references movies(id) on delete cascade,
  role text not null check (role in ('cast','director','producer')),
  character_name text,
  source text not null,
  created_at timestamptz not null default now(),
  unique (person_id, movie_id, role)
);

create table if not exists availability_snapshots (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references movies(id) on delete cascade,
  provider text not null,
  region text not null default 'US',
  access_type text not null check (access_type in ('FREE','ADS','FLATRATE','RENT','BUY')),
  status text not null check (status in ('NOW','UPCOMING','ANNOUNCED','UNKNOWN')),
  available_from timestamptz,
  available_until timestamptz,
  price numeric(10,2),
  currency text,
  source text not null,
  source_checked_at timestamptz not null,
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at timestamptz not null default now()
);

create index if not exists idx_people_name on people (lower(name));
create index if not exists idx_movies_title_year on movies (lower(title), release_year);
create index if not exists idx_credits_person_role on credits (person_id, role);
create index if not exists idx_credits_movie_role on credits (movie_id, role);
create index if not exists idx_availability_movie_checked on availability_snapshots (movie_id, source_checked_at desc);
create index if not exists idx_availability_provider_status on availability_snapshots (provider, region, status);
