create extension if not exists pgcrypto;

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null,
  event_type text not null check (event_type in ('search_completed','search_no_results','search_failed','provider_click')),
  visitor_key text not null,
  session_key text not null,
  query_text text,
  result_count integer check (result_count is null or result_count >= 0),
  error_code text,
  movie_id text,
  movie_title text,
  movie_year integer,
  provider text,
  monetization_type text check (monetization_type is null or monetization_type in ('FREE','ADS','FLATRATE','RENT','BUY')),
  price numeric(10,2),
  genre_words text[],
  person_name text,
  person_role text,
  requested_provider text,
  year_min integer,
  year_max integer,
  created_at timestamptz not null default now()
);

create table if not exists analytics_report_runs (
  week_start date primary key,
  week_end date not null,
  generated_at timestamptz not null,
  sent_at timestamptz,
  status text not null check (status in ('processing','failed','sent')),
  event_count integer not null default 0,
  last_error text
);

create index if not exists idx_analytics_events_occurred_at
  on analytics_events (occurred_at);
create index if not exists idx_analytics_events_type_time
  on analytics_events (event_type, occurred_at);
create index if not exists idx_analytics_events_visitor_time
  on analytics_events (visitor_key, occurred_at);
create index if not exists idx_analytics_events_session_time
  on analytics_events (session_key, occurred_at);
create index if not exists idx_analytics_events_provider_time
  on analytics_events (provider, occurred_at)
  where provider is not null;
create index if not exists idx_analytics_events_movie_time
  on analytics_events (movie_title, occurred_at)
  where movie_title is not null;
