create extension if not exists pgcrypto;

alter table if exists movies
  add column if not exists media_type text not null default 'MOVIE',
  add column if not exists canonical_title text,
  add column if not exists original_title text,
  add column if not exists release_date date,
  add column if not exists country_code text,
  add column if not exists source_url text,
  add column if not exists verified_at timestamptz,
  add column if not exists confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1));

alter table if exists people
  add column if not exists canonical_name text,
  add column if not exists source_url text,
  add column if not exists verified_at timestamptz,
  add column if not exists confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1));

alter table if exists credits
  drop constraint if exists credits_role_check;

alter table if exists credits
  add constraint credits_role_check check (role in ('cast','director','producer','writer'));

create table if not exists shows (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  title text not null,
  canonical_title text,
  original_title text,
  first_release_year integer,
  first_release_date date,
  country_code text,
  description text,
  source_url text,
  verified_at timestamptz,
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);

create table if not exists show_credits (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  show_id uuid not null references shows(id) on delete cascade,
  role text not null check (role in ('cast','director','producer','writer')),
  character_name text,
  source text not null,
  source_url text,
  verified_at timestamptz,
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at timestamptz not null default now(),
  unique (person_id, show_id, role)
);

create table if not exists genres (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  source text,
  source_url text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists themes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  source text,
  source_url text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists countries (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  source text,
  source_url text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists streaming_providers (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null unique,
  external_id text,
  homepage_url text,
  source text,
  source_url text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists movie_genres (
  movie_id uuid not null references movies(id) on delete cascade,
  genre_id uuid not null references genres(id) on delete cascade,
  source text,
  source_url text,
  verified_at timestamptz,
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  primary key (movie_id, genre_id)
);

create table if not exists movie_themes (
  movie_id uuid not null references movies(id) on delete cascade,
  theme_id uuid not null references themes(id) on delete cascade,
  source text,
  source_url text,
  verified_at timestamptz,
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  primary key (movie_id, theme_id)
);

create table if not exists movie_countries (
  movie_id uuid not null references movies(id) on delete cascade,
  country_id uuid not null references countries(id) on delete cascade,
  source text,
  source_url text,
  verified_at timestamptz,
  primary key (movie_id, country_id)
);

create table if not exists show_genres (
  show_id uuid not null references shows(id) on delete cascade,
  genre_id uuid not null references genres(id) on delete cascade,
  source text,
  source_url text,
  verified_at timestamptz,
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  primary key (show_id, genre_id)
);

create table if not exists show_themes (
  show_id uuid not null references shows(id) on delete cascade,
  theme_id uuid not null references themes(id) on delete cascade,
  source text,
  source_url text,
  verified_at timestamptz,
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  primary key (show_id, theme_id)
);

create table if not exists show_countries (
  show_id uuid not null references shows(id) on delete cascade,
  country_id uuid not null references countries(id) on delete cascade,
  source text,
  source_url text,
  verified_at timestamptz,
  primary key (show_id, country_id)
);

alter table if exists availability_snapshots
  add column if not exists provider_id uuid references streaming_providers(id),
  add column if not exists source_url text,
  add column if not exists verified_at timestamptz,
  add column if not exists title_specific_url text;

create index if not exists idx_shows_title_year on shows (lower(title), first_release_year);
create index if not exists idx_show_credits_person_role on show_credits (person_id, role);
create index if not exists idx_show_credits_show_role on show_credits (show_id, role);
create index if not exists idx_streaming_providers_name on streaming_providers (lower(canonical_name));
create index if not exists idx_availability_provider_id_checked on availability_snapshots (provider_id, source_checked_at desc);
