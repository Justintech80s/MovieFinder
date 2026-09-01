# MovieFinder Weekly Email Analytics — Design

## Goal

Add privacy-first, first-party analytics to MovieFinder that collect anonymous product-usage events in the background and send a real weekly business report to the owner's Gmail every Monday morning.

The feature must not add an analytics dashboard, change MovieFinder's visual design, or expose analytics data to site visitors.

## Product requirements

MovieFinder should report the previous week's real activity, including:

- anonymous visitors
- anonymous sessions
- returning-visitor percentage
- total searches
- searches per visitor
- most searched movies
- most searched actors/directors when the search parser identifies them
- most requested genres
- most requested streaming services
- failed/no-result searches
- provider clicks
- top titles by provider-click activity
- FREE vs ADS vs FLATRATE vs RENT vs BUY click activity
- search-to-provider-click conversion
- week-over-week growth
- concise automatically generated observations about meaningful trends and search-quality problems

The report is delivered as readable email content. No dashboard or attachment is required.

## Privacy requirements

The analytics system is deliberately anonymous and first-party.

It must not intentionally collect or persist:

- names
- email addresses from visitors
- account identities
- raw IP addresses
- exact GPS location
- advertising identifiers
- browser/device fingerprints

MovieFinder uses opaque random first-party identifiers only:

- `mf_vid`: anonymous visitor identifier
- `mf_sid`: anonymous session identifier

The browser receives random identifiers. Before storage, the server derives a one-way HMAC value using an application secret so stored identifiers cannot be reused as browser identifiers if the analytics database is exposed.

Search queries can accidentally contain personal information, so raw query text is not written directly to analytics storage. A sanitizer must:

- trim and normalize whitespace
- cap stored query text at 300 characters
- redact email-address patterns
- redact common U.S. phone-number patterns
- reject control characters

Only the sanitized query is stored.

## Current MovieFinder behavior relevant to analytics

The current production page performs searches through `GET /api/search?q=...` and renders provider links from the `url` field returned on each offer.

That allows most analytics to be added without changing the visible site:

1. search and no-result/error events can be recorded inside the existing search API;
2. anonymous visitor/session cookies can be set by the search API;
3. provider links can be changed server-side to pass through a MovieFinder redirect endpoint that records the click and then redirects to the original provider URL.

The current result cards themselves do not expose a distinct movie-detail click action. Therefore the first version will not invent a misleading `movie_clicked` metric. Instead, it will report title engagement using provider clicks by title. A true movie-result click metric can be added later if MovieFinder gains a real movie-detail/open action.

## Architecture

```text
MovieFinder browser
        |
        | GET /api/search?q=...
        v
Search API + analytics helpers
        |
        | anonymous event writes
        v
MovieFinder analytics database
        |
        | previous-week aggregation
        v
Weekly report generator
        |
        | Monday morning scheduled execution
        v
Email delivery provider
        |
        v
Owner Gmail inbox
```

Provider clicks follow a second path:

```text
MovieFinder result
        |
        | /api/out?...signed payload...
        v
MovieFinder outbound redirect endpoint
        |
        | record provider_click
        v
Original streaming/rental/purchase URL
```

## Components

### 1. Analytics identity helper

A focused server-side module owns visitor/session identity.

Responsibilities:

- read `mf_vid` and `mf_sid` cookies
- create cryptographically random values when missing
- refresh the session cookie on activity
- emit secure first-party cookies
- derive HMAC storage identifiers using `ANALYTICS_ID_SECRET`

Cookie behavior:

- `mf_vid`: approximately one-year lifetime
- `mf_sid`: approximately 30-minute inactivity lifetime, refreshed on search activity
- `HttpOnly`
- `Secure` in production
- `SameSite=Lax`
- path `/`

No IP-based identity fallback is used.

### 2. Event writer

A single analytics event API in code accepts a strict allow-list of event types and fields.

Initial event types:

- `search_completed`
- `search_no_results`
- `search_failed`
- `provider_click`

`search_completed` records the sanitized query, result count, parsed search dimensions, and timestamp.

`search_no_results` records the sanitized query and parsed dimensions when a valid search returns zero usable results.

`search_failed` records a sanitized query plus a low-cardinality error code, not raw stack traces or arbitrary upstream error text.

`provider_click` records title/work identifier when available, provider, monetization type, displayed price when available, and the originating anonymous/session identity.

Analytics failures must never make MovieFinder search fail. Event writes are best-effort and isolated from the user-facing response.

### 3. Analytics storage

Use a dedicated MovieFinder analytics table in the same future MovieFinder-owned Supabase environment as the existing MovieFinder persistence design. Do not place MovieFinder analytics in an unrelated product's Supabase project.

Initial schema stays intentionally small.

#### `analytics_events`

Suggested columns:

- `id uuid primary key`
- `occurred_at timestamptz not null`
- `event_type text not null`
- `visitor_key text not null`
- `session_key text not null`
- `query_text text null`
- `result_count integer null`
- `movie_id text null`
- `movie_title text null`
- `movie_year integer null`
- `provider text null`
- `monetization_type text null`
- `price numeric null`
- `genre_words text[] null`
- `person_name text null`
- `person_role text null`
- `requested_provider text null`
- `year_min integer null`
- `year_max integer null`
- `created_at timestamptz not null default now()`

Indexes should support date-range aggregation, event-type aggregation, visitor/session distinct counts, query analysis, provider analysis, and title analysis.

No separate session table or weekly-rollup table is needed initially. The expected early traffic level does not justify duplicated aggregate storage. Add rollups only if weekly queries become materially slow.

#### `analytics_report_runs`

A small idempotency table prevents duplicate Monday emails if the scheduled job retries.

Columns:

- `week_start date primary key`
- `week_end date not null`
- `generated_at timestamptz not null`
- `sent_at timestamptz null`
- `status text not null`
- `event_count integer not null default 0`

## Search instrumentation

The search API should create/refresh anonymous identity at the beginning of a request.

After a successful search:

- if results exist, write `search_completed`;
- if no usable results exist, write `search_no_results`.

For person-filmography searches, analytics should use the same parsed person and role already produced by MovieFinder rather than re-parsing the query separately.

On a search failure, write `search_failed` using a controlled code such as:

- `availability_unavailable`
- `search_internal_error`

Never block or delay the client response waiting on a nonessential analytics write longer than the configured database timeout.

## Provider-click instrumentation

The API currently returns provider URLs that the existing frontend uses directly. The new system changes those returned URLs to a same-origin redirect URL.

The redirect payload contains only the fields needed to log the click and reach the destination. It must be signed so visitors cannot freely alter provider/title metadata or turn MovieFinder into an open redirect.

Conceptually:

```text
/api/out?token=<signed-payload>
```

The signed payload contains:

- destination URL
- movie identifier/title/year
- provider
- monetization type
- displayed price when present
- expiration timestamp

The redirect endpoint:

1. validates the signature and expiration;
2. permits only `http:` or `https:` destinations;
3. resolves the anonymous visitor/session identity;
4. records `provider_click` best-effort;
5. responds with a temporary redirect to the original provider URL.

Invalid signatures return an error and never redirect.

This design preserves the current visual layout and existing provider-link behavior while adding measurable commercial-intent data.

## Weekly aggregation

The reporting window is the previous Monday 00:00 through the current Monday 00:00 in `America/New_York`.

The report generator calculates:

### Audience

- distinct `visitor_key`
- distinct `session_key`
- returning visitors: visitors seen before the report window who also appear during it
- searches per visitor
- week-over-week visitor and search growth

### Search demand

- total searches
- top sanitized queries
- top parsed people and roles
- top genres
- top requested providers
- top year/decade constraints
- no-result count and rate
- top no-result queries
- failure count and rate

### Commercial intent

- total provider clicks
- provider clicks by provider
- provider clicks by movie/title
- clicks by monetization type
- free/ad-supported vs subscription/rent/buy mix
- displayed-price bands for rent/buy clicks when price is available
- search-to-provider-click rate at session level

### Automated observations

Observations are deterministic rule-based statements generated from actual aggregates. They should not invent explanations for behavior.

Examples of allowed observations:

- `Horror searches increased 32% week over week.`
- `Prime Video received the most outbound provider clicks.`
- `The query "1990s crime movies" had a high no-result rate.`

Examples of disallowed observations:

- causal claims unsupported by the events
- fabricated audience demographics
- invented revenue numbers
- claims that a click became a completed stream, rental, or purchase

MovieFinder measures outbound intent, not transactions, unless a future partner supplies verified conversion data.

## Email report

The email subject should make the reporting window obvious, for example:

`MovieFinder Weekly Report — Aug 31–Sep 6`

The body is HTML with a plain-text fallback and contains:

1. **Growth** — visitors, sessions, searches, week-over-week changes
2. **What people wanted** — top queries, titles, people, genres, providers
3. **Commercial activity** — provider clicks and access-type breakdown
4. **Conversion** — search-to-provider-click rate
5. **Search problems** — no-result and failure rates plus top problem queries
6. **Opportunities** — concise rule-based observations
7. **Data note** — states that visitor/session identifiers are anonymous and provider clicks represent outbound intent rather than completed purchases

The destination Gmail address must be configured as a deployment secret such as `ANALYTICS_REPORT_TO`; it must not be committed to the repository.

Email delivery uses a small provider abstraction so the application is not permanently coupled to one vendor. The first implementation can use a transactional-email provider that supports server-side API delivery to Gmail. Provider credentials remain in Vercel environment variables.

## Scheduling

Use a Vercel scheduled function to run every Monday morning in New York time.

Because cron infrastructure commonly evaluates schedules in UTC, implementation must explicitly account for Eastern Standard Time/Eastern Daylight Time rather than hard-coding one UTC hour for the entire year.

The report-generation endpoint must also be protected by a secret so it cannot be triggered publicly without authorization.

The `analytics_report_runs` table makes sending idempotent: if the same week has already been marked sent, a retry does not send a second email.

## Data retention

Privacy-first default retention:

- raw analytics events: 90 days
- report-run records: 13 months

The Monday email itself becomes the long-term human-readable historical record unless longer aggregate retention is intentionally added later.

A scheduled cleanup step can delete expired raw events. Retention can be increased later if there is a clear business reason and the privacy policy is updated accordingly.

## Failure handling

Analytics is noncritical to search availability.

- database write failure: search/provider redirect continues; log a controlled server warning
- report aggregation failure: report remains unsent and can retry
- email provider failure: report run is not marked `sent`; retry is allowed
- redirect event-write failure: user still reaches the validated destination
- analytics database unavailable: MovieFinder search continues normally

No analytics failure may cause a successful movie search to become an HTTP 500/503 response.

## Security

- HMAC anonymous IDs before persistence
- keep all database credentials server-side
- keep report destination and email credentials in environment variables
- sign outbound redirect tokens
- enforce redirect-token expiration
- allow only HTTP/HTTPS redirect destinations
- use parameterized database queries/client bindings
- never include arbitrary stack traces in analytics records or weekly email
- rate-limit or otherwise abuse-protect the redirect/report endpoints if production traffic warrants it

## Google Analytics

Google Analytics is not required for the first implementation. The requested weekly report can be produced entirely from MovieFinder-owned first-party data.

GA4 can be added later for acquisition questions such as referrers, campaign traffic, and broad device categories, but MovieFinder's detailed search and provider-interest analytics should remain first-party.

## No visual changes

This feature does not change:

- MovieFinder branding
- search layout
- cards
- support screen
- payment/support destinations
- colors
- typography
- displayed movie information

Provider links still look and behave like provider links; they simply pass through the signed MovieFinder redirect endpoint before reaching the destination.

## Deployment prerequisites

Implementation can be written and tested on the feature branch without promoting production.

Before real reports can be sent, deployment needs:

1. a dedicated MovieFinder analytics-capable database environment;
2. server-side database credentials in Vercel;
3. `ANALYTICS_ID_SECRET`;
4. outbound-link signing secret;
5. `ANALYTICS_REPORT_TO` configured to the owner's Gmail address;
6. transactional-email provider credentials and sender configuration;
7. protected scheduled-report secret.

No secret values belong in GitHub.

## Testing and acceptance criteria

The feature is ready for production only when automated tests prove:

- visitor/session cookies are generated and reused correctly
- stored IDs are HMAC-derived rather than raw cookie values
- query sanitization redacts email/phone patterns
- successful searches produce the correct event
- no-result searches produce the correct event
- search failures produce controlled error events
- analytics write failures do not fail search requests
- provider URLs are converted to signed redirect URLs
- valid redirect tokens log a click and redirect correctly
- tampered/expired tokens do not redirect
- analytics write failure does not block a valid redirect
- weekly aggregation computes distinct visitors/sessions correctly
- returning visitors are computed correctly
- no-result rate and provider-click totals are correct
- previous-week and week-over-week windows respect `America/New_York`
- duplicate report runs do not send duplicate email
- report email contains the required sections using real aggregate values
- raw event cleanup respects the 90-day retention rule

Preview acceptance must verify that existing MovieFinder searches and provider links still function normally before any production promotion.

## Out of scope for version 1

- analytics dashboard
- visitor accounts
- names or visitor email collection
- precise geolocation
- device fingerprinting
- ad targeting
- verified rental/purchase/stream completion
- revenue attribution without partner conversion data
- AI-generated causal explanations of user behavior
- long-term data warehouse
- raw-event exports in the weekly email

These can be reconsidered only if a later product need justifies them.
