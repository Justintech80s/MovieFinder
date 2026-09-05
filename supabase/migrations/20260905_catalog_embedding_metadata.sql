alter table if exists movies
  add column if not exists embedding_model text,
  add column if not exists embedding_updated_at timestamptz;

alter table if exists shows
  add column if not exists embedding_model text,
  add column if not exists embedding_updated_at timestamptz;

create index if not exists idx_movies_embedding_pending
  on movies (updated_at)
  where embedding is null;

create index if not exists idx_shows_embedding_pending
  on shows (updated_at)
  where embedding is null;
