create extension if not exists vector;

alter table if exists movies
  add column if not exists search_document tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(canonical_title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(original_title,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(description,'')), 'C')
  ) stored,
  add column if not exists embedding vector(384);

alter table if exists shows
  add column if not exists search_document tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(canonical_title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(original_title,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(description,'')), 'C')
  ) stored,
  add column if not exists embedding vector(384);

create index if not exists idx_movies_search_document
  on movies using gin (search_document);

create index if not exists idx_shows_search_document
  on shows using gin (search_document);

create index if not exists idx_movies_embedding_hnsw
  on movies using hnsw (embedding vector_cosine_ops);

create index if not exists idx_shows_embedding_hnsw
  on shows using hnsw (embedding vector_cosine_ops);

create or replace function search_movies_full_text(
  search_query text,
  match_count integer default 40
)
returns table (
  id uuid,
  title text,
  release_year integer,
  description text,
  rank real
)
language sql
stable
as $$
  select
    m.id,
    m.title,
    m.release_year,
    m.description,
    ts_rank_cd(m.search_document, websearch_to_tsquery('english', search_query)) as rank
  from movies m
  where m.search_document @@ websearch_to_tsquery('english', search_query)
  order by rank desc, m.release_year desc nulls last
  limit least(greatest(match_count, 1), 80);
$$;

create or replace function search_shows_full_text(
  search_query text,
  match_count integer default 40
)
returns table (
  id uuid,
  title text,
  first_release_year integer,
  description text,
  rank real
)
language sql
stable
as $$
  select
    s.id,
    s.title,
    s.first_release_year,
    s.description,
    ts_rank_cd(s.search_document, websearch_to_tsquery('english', search_query)) as rank
  from shows s
  where s.search_document @@ websearch_to_tsquery('english', search_query)
  order by rank desc, s.first_release_year desc nulls last
  limit least(greatest(match_count, 1), 80);
$$;

create or replace function search_movies_semantic(
  query_embedding vector(384),
  match_count integer default 40
)
returns table (
  id uuid,
  title text,
  release_year integer,
  description text,
  similarity double precision
)
language sql
stable
as $$
  select
    m.id,
    m.title,
    m.release_year,
    m.description,
    1 - (m.embedding <=> query_embedding) as similarity
  from movies m
  where m.embedding is not null
  order by m.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 80);
$$;

create or replace function search_shows_semantic(
  query_embedding vector(384),
  match_count integer default 40
)
returns table (
  id uuid,
  title text,
  first_release_year integer,
  description text,
  similarity double precision
)
language sql
stable
as $$
  select
    s.id,
    s.title,
    s.first_release_year,
    s.description,
    1 - (s.embedding <=> query_embedding) as similarity
  from shows s
  where s.embedding is not null
  order by s.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 80);
$$;
