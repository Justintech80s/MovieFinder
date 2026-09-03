create extension if not exists vector with schema extensions;

set search_path = public, extensions;

create table if not exists public.cinema_documents (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid references public.cinema_entities(id) on delete set null,
  document_type text not null check (document_type in (
    'movie_summary',
    'movie_themes',
    'movie_style',
    'movie_context',
    'person_context',
    'genre_context',
    'movement_context',
    'relationship_context'
  )),
  title text not null default '',
  content text not null,
  content_hash text not null,
  source_kind text not null,
  source_ref text,
  source_url text,
  provenance jsonb not null default '{}'::jsonb,
  language text not null default 'en',
  embedding_model text,
  embedding_version text,
  embedding vector(1536),
  fts tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || content)
  ) stored,
  metadata jsonb not null default '{}'::jsonb,
  embedded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (language = 'en'),
  check (length(content_hash) = 64)
);

create unique index if not exists uq_cinema_documents_content_version
  on public.cinema_documents (
    coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
    document_type,
    content_hash,
    coalesce(embedding_model, ''),
    coalesce(embedding_version, '')
  );

create index if not exists idx_cinema_documents_entity_type
  on public.cinema_documents (entity_id, document_type);

create index if not exists idx_cinema_documents_fts
  on public.cinema_documents using gin (fts);

create index if not exists idx_cinema_documents_embedding_hnsw
  on public.cinema_documents using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

alter table public.cinema_documents enable row level security;

revoke all on table public.cinema_documents from anon, authenticated;
grant select, insert, update, delete on table public.cinema_documents to service_role;

create or replace function public.search_cinema_documents(
  query_text text,
  query_embedding vector(1536),
  match_count integer default 40
)
returns table (
  id uuid,
  entity_id uuid,
  document_type text,
  title text,
  content text,
  source_kind text,
  source_ref text,
  source_url text,
  provenance jsonb,
  metadata jsonb,
  lexical_rank bigint,
  semantic_rank bigint,
  fused_score double precision
)
language sql
stable
set search_path = public, extensions
as $$
  with bounds as (
    select least(greatest(match_count, 1), 40) as result_limit
  ),
  lexical as (
    select
      d.id,
      row_number() over (
        order by ts_rank_cd(d.fts, websearch_to_tsquery('english', query_text)) desc, d.id
      ) as lexical_rank
    from public.cinema_documents d
    where
      nullif(btrim(query_text), '') is not null
      and d.fts @@ websearch_to_tsquery('english', query_text)
    order by ts_rank_cd(d.fts, websearch_to_tsquery('english', query_text)) desc, d.id
    limit 30
  ),
  semantic as (
    select
      d.id,
      row_number() over (order by d.embedding <=> query_embedding, d.id) as semantic_rank
    from public.cinema_documents d
    where query_embedding is not null and d.embedding is not null
    order by d.embedding <=> query_embedding, d.id
    limit 30
  ),
  fused as (
    select
      coalesce(l.id, s.id) as id,
      l.lexical_rank,
      s.semantic_rank,
      coalesce(1.0 / (60 + l.lexical_rank), 0.0)
        + coalesce(1.0 / (60 + s.semantic_rank), 0.0) as fused_score
    from lexical l
    full outer join semantic s on s.id = l.id
  )
  select
    d.id,
    d.entity_id,
    d.document_type,
    d.title,
    d.content,
    d.source_kind,
    d.source_ref,
    d.source_url,
    d.provenance,
    d.metadata,
    f.lexical_rank,
    f.semantic_rank,
    f.fused_score
  from fused f
  join public.cinema_documents d on d.id = f.id
  order by f.fused_score desc, d.id
  limit (select result_limit from bounds);
$$;

revoke all on function public.search_cinema_documents(text, vector, integer) from public, anon, authenticated;
grant execute on function public.search_cinema_documents(text, vector, integer) to service_role;
