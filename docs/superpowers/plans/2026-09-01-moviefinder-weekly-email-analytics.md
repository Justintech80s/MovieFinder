# MovieFinder Weekly Email Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add privacy-first anonymous MovieFinder analytics that collect real search/provider-interest activity and send a truthful weekly Monday-morning report to the owner's Gmail without changing the MovieFinder UI.

**Architecture:** Instrument the existing server-side search API so searches are measured without touching the production homepage HTML, route provider links through a signed same-origin redirect so outbound commercial intent is measurable, store only sanitized anonymous events in a dedicated MovieFinder Supabase database, and aggregate those events into a Monday email delivered through Resend. Vercel Cron invokes the report endpoint at UTC times covering both EDT and EST; the handler checks New York local time and report-run idempotency before sending.

**Tech Stack:** Node.js ES modules, built-in `node:crypto`, native `fetch`, Vercel Functions, Vercel Cron, Supabase/PostgREST, PostgreSQL migration SQL, Resend HTTP API, Node's built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-01-moviefinder-weekly-email-analytics-design.md`

## Global Constraints

- Do not change MovieFinder branding, layout, cards, support screen, support/payment destinations, colors, typography, or displayed movie information.
- Do not add an analytics dashboard.
- Do not intentionally persist visitor names, visitor email addresses, account identities, raw IP addresses, exact GPS location, advertising IDs, or browser/device fingerprints.
- Raw analytics events are retained for 90 days; report-run records are retained for 13 months.
- Analytics failures must never make a successful MovieFinder search or validated provider redirect fail.
- Provider clicks measure outbound intent only; never describe them as completed streams, rentals, purchases, or revenue.
- Version 1 `active visitors` means distinct anonymous visitors observed in search or provider-click events. Passive homepage-only visits are not counted because the GitHub feature branch does not contain the production homepage HTML.
- No secret value may be committed to GitHub.
- Keep production untouched until automated tests and Preview acceptance pass.

---

## File Structure

### New files

- `supabase/migrations/20260901_anonymous_analytics.sql` — analytics event/report-run schema and indexes.
- `lib/analytics/privacy.js` — query sanitization and HMAC identifier derivation.
- `lib/analytics/identity.js` — first-party visitor/session cookie lifecycle.
- `lib/analytics/store.js` — narrow Supabase/PostgREST analytics persistence adapter.
- `lib/analytics/events.js` — allow-listed analytics event construction and best-effort write wrapper.
- `lib/analytics/outbound.js` — signed outbound redirect token creation/verification and response URL wrapping.
- `api/out.js` — provider-click logging plus safe temporary redirect.
- `lib/analytics/report.js` — New York reporting windows, aggregation, rates, growth, and deterministic observations.
- `lib/analytics/email.js` — weekly report HTML/plain-text rendering and Resend transport.
- `api/weekly-report.js` — protected/idempotent weekly-report cron endpoint.
- `vercel.json` — Monday cron schedule covering EDT and EST.
- `tests/analytics/schema.test.js`
- `tests/analytics/privacy.test.js`
- `tests/analytics/identity.test.js`
- `tests/analytics/store.test.js`
- `tests/analytics/events.test.js`
- `tests/analytics/outbound.test.js`
- `tests/analytics/out-api.test.js`
- `tests/analytics/report.test.js`
- `tests/analytics/email.test.js`
- `tests/analytics/weekly-report-api.test.js`

### Modified files

- `api/search.js` — inject analytics safely, emit search events, and replace provider offer URLs with signed MovieFinder redirect URLs after ranking/filtering.
- `tests/search/api-handler.test.js` — expand the response recorder for cookies and prove analytics failures do not change search behavior.

No homepage/front-end file is created or modified.

---

### Task 1: Analytics Database Schema

**Files:**
- Create: `supabase/migrations/20260901_anonymous_analytics.sql`
- Create: `tests/analytics/schema.test.js`

**Interfaces:**
- Produces: PostgreSQL tables `analytics_events` and `analytics_report_runs` consumed by `lib/analytics/store.js`.
- Produces event fields matching the approved design exactly enough for weekly aggregation.

- [ ] **Step 1: Write the failing schema contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations/20260901_anonymous_analytics.sql', 'utf8');

test('analytics migration defines privacy-first event and report-run storage', () => {
  assert.match(sql, /create table if not exists analytics_events/i);
  assert.match(sql, /event_type text not null/i);
  assert.match(sql, /visitor_key text not null/i);
  assert.match(sql, /session_key text not null/i);
  assert.match(sql, /query_text text/i);
  assert.match(sql, /provider text/i);
  assert.match(sql, /monetization_type text/i);
  assert.match(sql, /create table if not exists analytics_report_runs/i);
  assert.match(sql, /week_start date primary key/i);
  assert.match(sql, /status text not null/i);
  assert.doesNotMatch(sql, /\bip_address\b/i);
  assert.doesNotMatch(sql, /\bemail\b/i);
  assert.doesNotMatch(sql, /\bdevice_fingerprint\b/i);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test tests/analytics/schema.test.js
```

Expected: FAIL because `20260901_anonymous_analytics.sql` does not exist.

- [ ] **Step 3: Create the migration**

```sql
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
```

- [ ] **Step 4: Run the schema test and the existing schema test**

```bash
node --test tests/analytics/schema.test.js tests/search/schema.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260901_anonymous_analytics.sql tests/analytics/schema.test.js
git commit -m "feat: add anonymous analytics schema"
```

---

### Task 2: Privacy Sanitizer and Anonymous Identity

**Files:**
- Create: `lib/analytics/privacy.js`
- Create: `lib/analytics/identity.js`
- Create: `tests/analytics/privacy.test.js`
- Create: `tests/analytics/identity.test.js`

**Interfaces:**
- Produces: `sanitizeQuery(value) -> string`.
- Produces: `deriveAnalyticsKey(rawId, secret) -> string`.
- Produces: `resolveAnalyticsIdentity(req, res, options?) -> { visitorKey, sessionKey } | null`.
- `resolveAnalyticsIdentity` writes `mf_vid` and/or `mf_sid` HttpOnly cookies only when needed/refreshed and never reads IP headers.

- [ ] **Step 1: Write privacy tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeQuery, deriveAnalyticsKey } from '../../lib/analytics/privacy.js';

test('sanitizeQuery redacts email and US phone patterns', () => {
  const value = sanitizeQuery('find movies for jane@example.com call (617) 555-0100');
  assert.equal(value, 'find movies for [redacted-email] call [redacted-phone]');
});

test('sanitizeQuery normalizes whitespace and caps stored text at 300 chars', () => {
  const value = sanitizeQuery(`  horror\n movies   ${'x'.repeat(400)} `);
  assert.ok(value.length <= 300);
  assert.ok(!value.includes('\n'));
  assert.ok(!value.includes('  '));
});

test('deriveAnalyticsKey is deterministic HMAC and does not return raw id', () => {
  const a = deriveAnalyticsKey('visitor-raw', 'secret-value');
  const b = deriveAnalyticsKey('visitor-raw', 'secret-value');
  assert.equal(a, b);
  assert.notEqual(a, 'visitor-raw');
  assert.match(a, /^[A-Za-z0-9_-]{40,}$/);
});
```

- [ ] **Step 2: Write identity tests with a response cookie recorder**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAnalyticsIdentity } from '../../lib/analytics/identity.js';

function resRecorder(){
  const headers = new Map();
  return {
    setHeader(name, value){ headers.set(name.toLowerCase(), value); },
    getHeader(name){ return headers.get(name.toLowerCase()); }
  };
}

test('new visitor gets persistent visitor and short session cookies', () => {
  const res = resRecorder();
  const identity = resolveAnalyticsIdentity({headers:{cookie:''}}, res, {
    secret:'test-secret',
    randomId:()=>['visitor-raw','session-raw'].shift()
  });
  const cookies = res.getHeader('set-cookie');
  assert.ok(Array.isArray(cookies));
  assert.ok(cookies.some(x=>x.startsWith('mf_vid=')));
  assert.ok(cookies.some(x=>x.startsWith('mf_sid=')));
  assert.ok(cookies.every(x=>x.includes('HttpOnly')));
  assert.ok(cookies.every(x=>x.includes('SameSite=Lax')));
  assert.notEqual(identity.visitorKey, 'visitor-raw');
  assert.notEqual(identity.sessionKey, 'session-raw');
});

test('existing visitor/session cookies are reused but session lifetime is refreshed', () => {
  const res = resRecorder();
  const identity = resolveAnalyticsIdentity({headers:{cookie:'mf_vid=v1; mf_sid=s1'}}, res, {secret:'test-secret'});
  assert.ok(identity.visitorKey);
  assert.ok(identity.sessionKey);
  const cookies = res.getHeader('set-cookie');
  assert.equal(cookies.length, 1);
  assert.ok(cookies[0].startsWith('mf_sid=s1'));
});

test('missing analytics secret disables identity instead of exposing raw ids', () => {
  const res = resRecorder();
  assert.equal(resolveAnalyticsIdentity({headers:{}}, res, {secret:''}), null);
});
```

- [ ] **Step 3: Run tests and verify RED**

```bash
node --test tests/analytics/privacy.test.js tests/analytics/identity.test.js
```

Expected: FAIL because modules do not exist.

- [ ] **Step 4: Implement `lib/analytics/privacy.js`**

```js
import { createHmac } from 'node:crypto';

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?<!\d)(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?!\d)/g;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeQuery(value=''){
  return String(value)
    .replace(CONTROL_RE, '')
    .replace(EMAIL_RE, '[redacted-email]')
    .replace(PHONE_RE, '[redacted-phone]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

export function deriveAnalyticsKey(rawId, secret){
  if(!rawId || !secret) throw new Error('analytics id and secret are required');
  return createHmac('sha256', secret).update(String(rawId)).digest('base64url');
}
```

- [ ] **Step 5: Implement `lib/analytics/identity.js`**

Use `randomBytes(24).toString('base64url')`, a small cookie parser, `deriveAnalyticsKey`, `Max-Age=31536000` for `mf_vid`, and `Max-Age=1800` for `mf_sid`. Append `Secure` when `process.env.VERCEL_ENV === 'production'` or `options.secure === true`.

The exported function must match:

```js
export function resolveAnalyticsIdentity(req, res, {
  secret=process.env.ANALYTICS_ID_SECRET,
  randomId=()=>randomBytes(24).toString('base64url'),
  secure=process.env.VERCEL_ENV === 'production'
}={})
```

When cookie values already exist, never expose them in the returned object; return only HMAC-derived `visitorKey` and `sessionKey`.

- [ ] **Step 6: Run tests and verify GREEN**

```bash
node --test tests/analytics/privacy.test.js tests/analytics/identity.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/analytics/privacy.js lib/analytics/identity.js tests/analytics/privacy.test.js tests/analytics/identity.test.js
git commit -m "feat: add privacy-first analytics identity"
```

---

### Task 3: Supabase Analytics Store and Best-Effort Event Writer

**Files:**
- Create: `lib/analytics/store.js`
- Create: `lib/analytics/events.js`
- Create: `tests/analytics/store.test.js`
- Create: `tests/analytics/events.test.js`

**Interfaces:**
- Produces: `createAnalyticsStore({ fetchImpl=fetch, env=process.env })`.
- Store methods: `insertEvent(event)`, `listEvents({start,end})`, `listPriorVisitorKeys(visitorKeys,before)`, `getReportRun(weekStart)`, `setReportRun(run)`, `deleteEventsBefore(cutoff)`.
- Produces: `recordEventBestEffort({ store, event, logger=console }) -> Promise<boolean>`.
- Produces: `buildSearchEvent(...)` and `buildProviderClickEvent(...)` with strict field allow-lists.

- [ ] **Step 1: Write store request-contract tests**

Use an injected `fetchImpl` that captures URL/method/headers/body. Assert:

```js
const store = createAnalyticsStore({
  env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-key'},
  fetchImpl: async (url, init) => {
    seen.push({url:String(url),init});
    return {ok:true,status:201,json:async()=>[],headers:new Headers()};
  }
});
await store.insertEvent({event_type:'search_completed',visitor_key:'v',session_key:'s',occurred_at:'2026-09-01T12:00:00Z'});
assert.match(seen[0].url,/\/rest\/v1\/analytics_events$/);
assert.equal(seen[0].init.method,'POST');
assert.equal(seen[0].init.headers.apikey,'service-key');
assert.equal(seen[0].init.headers.authorization,'Bearer service-key');
```

Also test that missing `SUPABASE_URL` or service key makes the store disabled and `insertEvent` resolve `false` without issuing a network request.

- [ ] **Step 2: Write event-construction and failure-isolation tests**

```js
const event = buildSearchEvent({
  type:'search_completed',
  query:'scary movies jane@example.com',
  parsed:{genreWords:['horror'],provider:'Netflix',personName:null,role:null,yearMin:1990,yearMax:1999},
  resultCount:12,
  identity:{visitorKey:'v',sessionKey:'s'},
  occurredAt:'2026-09-01T12:00:00Z'
});
assert.equal(event.query_text,'scary movies [redacted-email]');
assert.deepEqual(event.genre_words,['horror']);
assert.equal(event.requested_provider,'Netflix');

const ok = await recordEventBestEffort({
  store:{insertEvent:async()=>{throw new Error('database unavailable');}},
  event,
  logger:{warn:()=>{}}
});
assert.equal(ok,false);
```

- [ ] **Step 3: Run tests and verify RED**

```bash
node --test tests/analytics/store.test.js tests/analytics/events.test.js
```

- [ ] **Step 4: Implement store with native PostgREST calls**

Use no new npm dependency. Centralize headers:

```js
function headers(serviceKey, extra={}){
  return {
    apikey:serviceKey,
    authorization:`Bearer ${serviceKey}`,
    'content-type':'application/json',
    ...extra
  };
}
```

`listEvents` must page in batches of 1000 using `Range` headers until a page returns fewer than 1000 rows. The URL filters must be `occurred_at=gte.<ISO>` and `occurred_at=lt.<ISO>`.

`listPriorVisitorKeys` must chunk visitor keys in batches of 100 and query only `visitor_key` for events earlier than `before`; return a `Set` of matching keys.

`getReportRun` reads `analytics_report_runs` by `week_start=eq.YYYY-MM-DD`.

`setReportRun` uses `POST` with `Prefer: resolution=merge-duplicates,return=minimal` so one row per week is updated idempotently.

`deleteEventsBefore` sends `DELETE /rest/v1/analytics_events?occurred_at=lt.<ISO>`.

- [ ] **Step 5: Implement strict event builders**

`events.js` must never spread arbitrary request or parser objects into database rows. Explicitly construct only approved columns.

The error-code allow-list is:

```js
const ERROR_CODES = new Set(['availability_unavailable','search_internal_error']);
```

Unknown error codes are stored as `search_internal_error`.

- [ ] **Step 6: Run tests and verify GREEN**

```bash
node --test tests/analytics/store.test.js tests/analytics/events.test.js
```

- [ ] **Step 7: Commit**

```bash
git add lib/analytics/store.js lib/analytics/events.js tests/analytics/store.test.js tests/analytics/events.test.js
git commit -m "feat: add analytics event persistence"
```

---

### Task 4: Instrument MovieFinder Search Without Changing Search Results

**Files:**
- Modify: `api/search.js`
- Modify: `tests/search/api-handler.test.js`
- Create: `tests/analytics/search-integration.test.js`

**Interfaces:**
- Consumes: `resolveAnalyticsIdentity`, `buildSearchEvent`, `recordEventBestEffort`, `createAnalyticsStore`.
- Produces: `createSearchHandler({analyticsStore, now, logger}={})` while preserving the current default export handler and response shape.

- [ ] **Step 1: Add an injectable handler factory in the test contract**

Write a test that imports both:

```js
import handler, { createSearchHandler } from '../../api/search.js';
assert.equal(typeof handler,'function');
assert.equal(typeof createSearchHandler,'function');
```

Expand `responseRecorder()` to support headers:

```js
const headers = new Map();
setHeader(name,value){headers.set(name.toLowerCase(),value);return this;},
getHeader(name){return headers.get(name.toLowerCase());}
```

- [ ] **Step 2: Write integration tests for search events**

Create a fake store collecting inserted events. With the same mocked JustWatch response pattern already used by `tests/search/api-handler.test.js`, prove:

- a non-empty catalog search emits exactly one `search_completed` event;
- a valid zero-result response emits exactly one `search_no_results` event;
- an upstream availability failure emits exactly one `search_failed` event with `availability_unavailable`;
- event-write rejection does not change the search HTTP status or results.

Example core assertion:

```js
const events=[];
const analyticsStore={insertEvent:async event=>{events.push(event);return true;}};
const testHandler=createSearchHandler({analyticsStore,now:()=>new Date('2026-09-01T12:00:00Z'),analyticsSecret:'test-secret',logger:{warn:()=>{}}});
// invoke with mocked catalog
assert.equal(res.statusCode,200);
assert.equal(events.length,1);
assert.equal(events[0].event_type,'search_completed');
assert.equal(events[0].result_count,1);
```

- [ ] **Step 3: Run tests and verify RED**

```bash
node --test tests/analytics/search-integration.test.js tests/search/api-handler.test.js
```

- [ ] **Step 4: Refactor `api/search.js` minimally**

Add imports:

```js
import { resolveAnalyticsIdentity } from '../lib/analytics/identity.js';
import { createAnalyticsStore } from '../lib/analytics/store.js';
import { buildSearchEvent, recordEventBestEffort } from '../lib/analytics/events.js';
```

Wrap existing handler logic with:

```js
export function createSearchHandler({
  analyticsStore=createAnalyticsStore(),
  analyticsSecret=process.env.ANALYTICS_ID_SECRET,
  now=()=>new Date(),
  logger=console
}={}) {
  return async function handler(req,res){
    // preserve current search behavior; add analytics around final response paths
  };
}

export default createSearchHandler();
```

Resolve identity only after confirming `q` is present. Do not inspect IP headers.

For person-filmography and catalog success paths, calculate the result array first, then record `search_completed` or `search_no_results` best-effort before returning the existing JSON response.

In the catch block, map availability failures to `availability_unavailable`, everything else to `search_internal_error`, record best-effort, then preserve the existing 503/500 response contract.

- [ ] **Step 5: Run integration plus existing search tests**

```bash
node --test tests/analytics/search-integration.test.js tests/search/api-handler.test.js tests/search/intent.test.js tests/search/constraints.test.js
```

Expected: PASS with unchanged search assertions.

- [ ] **Step 6: Commit**

```bash
git add api/search.js tests/search/api-handler.test.js tests/analytics/search-integration.test.js
git commit -m "feat: record anonymous search analytics"
```

---

### Task 5: Signed Provider-Click Redirect Tracking

**Files:**
- Create: `lib/analytics/outbound.js`
- Create: `api/out.js`
- Modify: `api/search.js`
- Create: `tests/analytics/outbound.test.js`
- Create: `tests/analytics/out-api.test.js`

**Interfaces:**
- Produces: `createOutboundToken(payload, secret, options?) -> string`.
- Produces: `verifyOutboundToken(token, secret, options?) -> payload` and throws controlled validation errors.
- Produces: `trackMovieOfferUrls(movie, secret, options?) -> movie`.
- `api/out.js` consumes a signed token, records `provider_click`, then responds `302 Location: <validated destination>`.

- [ ] **Step 1: Write token tests**

```js
const secret='outbound-secret';
const token=createOutboundToken({
  destination:'https://example.com/watch',movieId:'m1',movieTitle:'The Godfather',movieYear:1972,
  provider:'Example Streamer',monetizationType:'RENT',price:3.99
},secret,{nowMs:1_000,ttlMs:60_000});
const payload=verifyOutboundToken(token,secret,{nowMs:20_000});
assert.equal(payload.destination,'https://example.com/watch');
assert.equal(payload.provider,'Example Streamer');
```

Also test:

- one-character token tampering is rejected;
- expired token is rejected;
- `javascript:` and `data:` destinations are rejected;
- a valid signed `http:` or `https:` destination is accepted.

- [ ] **Step 2: Write outbound API tests**

Use an injectable factory:

```js
export function createOutboundHandler({analyticsStore,analyticsSecret,outboundSecret,now,logger}={})
```

Prove:

- valid token returns status 302 and original `Location`;
- a `provider_click` event contains title/provider/type/price;
- database failure still returns the valid 302;
- invalid token returns 400 and never sets `Location`.

- [ ] **Step 3: Run tests and verify RED**

```bash
node --test tests/analytics/outbound.test.js tests/analytics/out-api.test.js
```

- [ ] **Step 4: Implement compact signed token**

Use built-in crypto only. Token format:

```text
<base64url(JSON payload)>.<base64url(HMAC-SHA256 signature)>
```

The JSON payload includes `exp` in Unix milliseconds. Compare HMAC signatures with `timingSafeEqual` after verifying equal buffer lengths.

Reject destination URLs unless:

```js
const url = new URL(payload.destination);
if(!['http:','https:'].includes(url.protocol)) throw new Error('invalid destination');
```

- [ ] **Step 5: Implement `api/out.js`**

Resolve anonymous identity using the same cookies as search. If identity or analytics storage is unavailable, skip event storage and still redirect after signature validation.

Return:

```js
res.statusCode=302;
res.setHeader('Location',payload.destination);
res.setHeader('Cache-Control','no-store');
return res.end();
```

- [ ] **Step 6: Wrap offer URLs only at the final API-response boundary**

Do not change internal JustWatch matching/filtering. After ranking/filtering is complete, transform each response movie's `offers[].url` and `best.url` into `/api/out?token=...` using `OUTBOUND_LINK_SECRET`.

If `OUTBOUND_LINK_SECRET` is absent, preserve the original provider URL. This keeps Preview/search functional while deployment secrets are being configured and avoids broken links.

- [ ] **Step 7: Run redirect plus search regression tests**

```bash
node --test tests/analytics/outbound.test.js tests/analytics/out-api.test.js tests/search/api-handler.test.js tests/analytics/search-integration.test.js
```

- [ ] **Step 8: Commit**

```bash
git add lib/analytics/outbound.js api/out.js api/search.js tests/analytics/outbound.test.js tests/analytics/out-api.test.js
git commit -m "feat: track signed provider redirects"
```

---

### Task 6: Weekly Window and Business-Metric Aggregation

**Files:**
- Create: `lib/analytics/report.js`
- Create: `tests/analytics/report.test.js`

**Interfaces:**
- Produces: `getWeeklyWindows(now, timeZone='America/New_York')`.
- Produces: `aggregateWeeklyReport({currentEvents,comparisonEvents,priorVisitorKeys,window}) -> summary`.
- Produces: `buildObservations(summary) -> string[]`.
- No network or database logic belongs in this module.

- [ ] **Step 1: Write timezone/DST tests**

Test dates on each side of daylight-saving time. The desired report window is always local Monday 00:00 through the next Monday 00:00.

```js
const summer=getWeeklyWindows(new Date('2026-09-07T12:00:00Z'));
assert.equal(summer.current.start.toISOString(),'2026-08-31T04:00:00.000Z');
assert.equal(summer.current.end.toISOString(),'2026-09-07T04:00:00.000Z');

const winter=getWeeklyWindows(new Date('2026-12-07T13:00:00Z'));
assert.equal(winter.current.start.toISOString(),'2026-11-30T05:00:00.000Z');
assert.equal(winter.current.end.toISOString(),'2026-12-07T05:00:00.000Z');
```

Implement the conversion with `Intl.DateTimeFormat(...,{timeZone})` plus an iterative `zonedLocalMidnightToUtc` helper; do not hard-code `-04:00` or `-05:00` into production logic.

- [ ] **Step 2: Write deterministic aggregation fixtures**

Build a small fixture covering:

- visitor `v1` with two searches and one provider click;
- visitor `v2` with one no-result search;
- `v1` present in `priorVisitorKeys` so it counts as returning;
- one Netflix requested-provider search;
- Horror genre searches;
- provider clicks split between `FLATRATE` and `RENT`;
- previous-week fixture with lower search count.

Assert exact values for:

```js
summary.activeVisitors
summary.sessions
summary.searches
summary.returningVisitorRate
summary.noResultRate
summary.providerClicks
summary.searchToProviderClickRate
summary.topQueries
summary.topPeople
summary.topGenres
summary.topRequestedProviders
summary.topClickedProviders
summary.topClickedTitles
summary.accessTypeClicks
summary.weekOverWeek.searchesPct
```

Define `searchToProviderClickRate` as:

```text
sessions containing >=1 provider_click / sessions containing >=1 search event
```

This avoids claiming that each click maps one-to-one to a specific search.

- [ ] **Step 3: Write observation tests**

Assertions must prove observations are factual and deterministic. Example:

```js
assert.ok(buildObservations(summary).includes('Prime Video received the most outbound provider clicks.'));
assert.ok(buildObservations(summary).every(x=>!/(revenue|purchase completed|watched)/i.test(x)));
```

- [ ] **Step 4: Run report tests and verify RED**

```bash
node --test tests/analytics/report.test.js
```

- [ ] **Step 5: Implement `report.js` with small pure helpers**

Recommended internal helpers:

```js
countBy(events, selector)
topN(map, n=10)
percent(numerator, denominator)
growthPct(current, previous)
uniqueValues(events, selector)
```

Search event set is `search_completed`, `search_no_results`, and `search_failed`. Successful/no-result demand metrics should not double-count provider-click events.

`activeVisitors` is distinct `visitor_key` across search/provider-click events and must be labeled as active visitors in email output.

- [ ] **Step 6: Run tests and verify GREEN**

```bash
node --test tests/analytics/report.test.js
```

- [ ] **Step 7: Commit**

```bash
git add lib/analytics/report.js tests/analytics/report.test.js
git commit -m "feat: aggregate weekly MovieFinder analytics"
```

---

### Task 7: Weekly Email Rendering and Delivery

**Files:**
- Create: `lib/analytics/email.js`
- Create: `tests/analytics/email.test.js`

**Interfaces:**
- Produces: `renderWeeklyEmail(summary) -> {subject, html, text}`.
- Produces: `sendWeeklyEmail({message, fetchImpl=fetch, env=process.env}) -> Promise<{id}>`.
- Resend environment variables: `RESEND_API_KEY`, `ANALYTICS_REPORT_FROM`, `ANALYTICS_REPORT_TO`.

- [ ] **Step 1: Write email rendering tests**

Given a fixed summary, assert subject and required sections:

```js
const message=renderWeeklyEmail(summary);
assert.equal(message.subject,'MovieFinder Weekly Report — Aug 31–Sep 6');
for(const section of ['Growth','What people wanted','Commercial activity','Conversion','Search problems','Opportunities']){
  assert.match(message.text,new RegExp(section));
  assert.match(message.html,new RegExp(section));
}
assert.match(message.text,/Active anonymous visitors/i);
assert.match(message.text,/outbound intent/i);
assert.doesNotMatch(message.text,/completed purchase/i);
```

- [ ] **Step 2: Write Resend transport test**

Capture the request and assert:

```js
assert.equal(url,'https://api.resend.com/emails');
assert.equal(init.method,'POST');
assert.equal(init.headers.authorization,'Bearer resend-test-key');
const body=JSON.parse(init.body);
assert.equal(body.to,'owner@example.com');
assert.equal(body.from,'MovieFinder <reports@moviefinder.example>');
```

Missing required environment variables must throw a controlled configuration error before network I/O.

- [ ] **Step 3: Run tests and verify RED**

```bash
node --test tests/analytics/email.test.js
```

- [ ] **Step 4: Implement report HTML/plain text**

Use HTML tables/sections that render directly in Gmail; do not create an attachment. Escape all query/title/provider text before inserting into HTML.

The Data Note must say, in substance:

```text
Active visitors and sessions use anonymous first-party identifiers. Provider clicks represent outbound viewing/rental/purchase intent; MovieFinder does not infer completed transactions from these clicks.
```

- [ ] **Step 5: Implement Resend transport using native fetch**

```js
const response=await fetchImpl('https://api.resend.com/emails',{
  method:'POST',
  headers:{
    authorization:`Bearer ${env.RESEND_API_KEY}`,
    'content-type':'application/json'
  },
  body:JSON.stringify({
    from:env.ANALYTICS_REPORT_FROM,
    to:env.ANALYTICS_REPORT_TO,
    subject:message.subject,
    html:message.html,
    text:message.text
  })
});
```

Throw on non-2xx response; do not mark a report sent if delivery fails.

- [ ] **Step 6: Run tests and verify GREEN**

```bash
node --test tests/analytics/email.test.js
```

- [ ] **Step 7: Commit**

```bash
git add lib/analytics/email.js tests/analytics/email.test.js
git commit -m "feat: render and send weekly analytics email"
```

---

### Task 8: Protected Monday Cron, Retry Safety, and Retention Cleanup

**Files:**
- Create: `api/weekly-report.js`
- Create: `vercel.json`
- Create: `tests/analytics/weekly-report-api.test.js`

**Interfaces:**
- Consumes analytics store, report aggregator, email renderer/transport.
- Produces: `createWeeklyReportHandler({store,sendEmail,now,env,logger}={})`.
- Protected by Vercel's `Authorization: Bearer <CRON_SECRET>` convention.

- [ ] **Step 1: Write authorization and local-time tests**

Prove:

- missing/wrong bearer token returns 401;
- Monday 08:00 New York proceeds;
- Monday 09:00 New York can retry an unsent/failed run;
- Monday 07:00 or 10:00 New York returns a harmless skipped response;
- already-sent week does not resend.

- [ ] **Step 2: Write end-to-end report handler test with fake store/email**

The fake store must expose:

```js
listEvents({start,end})
listPriorVisitorKeys(visitorKeys,before)
getReportRun(weekStart)
setReportRun(run)
deleteEventsBefore(cutoff)
```

Assert the handler:

1. reads the previous week plus comparison week;
2. marks the run `processing`;
3. sends exactly one email;
4. marks the run `sent` with event count;
5. calls cleanup using `now - 90 days`;
6. preserves `failed` status and does not mark sent if email delivery rejects.

- [ ] **Step 3: Run tests and verify RED**

```bash
node --test tests/analytics/weekly-report-api.test.js
```

- [ ] **Step 4: Implement the cron handler**

Authorization contract:

```js
if(!env.CRON_SECRET || req.headers?.authorization !== `Bearer ${env.CRON_SECRET}`){
  return res.status(401).json({success:false});
}
```

Local-time gate uses `Intl.DateTimeFormat` with `America/New_York`; process only Monday local hour 8 or 9.

Idempotency behavior:

- if existing run status is `sent`, return 200 `{success:true, skipped:'already_sent'}`;
- otherwise upsert `processing` before aggregation/email;
- on delivery success upsert `sent` with `sent_at`;
- on error upsert `failed` with a short sanitized `last_error`, return 500 so the failure is observable/retryable.

- [ ] **Step 5: Add DST-safe Vercel cron configuration**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {"path":"/api/weekly-report","schedule":"0 12 * * 1"},
    {"path":"/api/weekly-report","schedule":"0 13 * * 1"},
    {"path":"/api/weekly-report","schedule":"0 14 * * 1"}
  ]
}
```

Reason: during EDT, 12:00 UTC is 08:00 New York and 13:00 UTC provides a 09:00 retry opportunity; during EST, 13:00 UTC is 08:00 and 14:00 UTC provides the 09:00 retry opportunity. The handler's local-time gate ignores the extra 07:00/10:00 invocation. Multiple cron entries targeting one path are supported by Vercel.

- [ ] **Step 6: Run tests and verify GREEN**

```bash
node --test tests/analytics/weekly-report-api.test.js tests/analytics/report.test.js tests/analytics/email.test.js
```

- [ ] **Step 7: Commit**

```bash
git add api/weekly-report.js vercel.json tests/analytics/weekly-report-api.test.js
git commit -m "feat: schedule weekly analytics report"
```

---

### Task 9: Full Regression Verification Before Any Live Configuration

**Files:**
- No feature code expected unless tests reveal a defect.

**Interfaces:**
- Verifies all new analytics behavior and all existing MovieFinder search behavior together.

- [ ] **Step 1: Run the full repository test suite**

```bash
npm test
```

Expected: every test passes; zero failures.

- [ ] **Step 2: Run focused high-risk regression tests again**

```bash
node --test \
  tests/search/api-handler.test.js \
  tests/search/intent.test.js \
  tests/search/constraints.test.js \
  tests/search/person-search.test.js \
  tests/analytics/search-integration.test.js \
  tests/analytics/out-api.test.js \
  tests/analytics/weekly-report-api.test.js
```

Expected: PASS.

- [ ] **Step 3: Inspect the branch diff for prohibited changes**

Verify no homepage/support/payment file was added or changed and no secret-looking value appears in the diff.

```bash
git diff --name-only main...HEAD
git grep -nE '(SUPABASE_SERVICE_ROLE_KEY=|RESEND_API_KEY=|ANALYTICS_ID_SECRET=|OUTBOUND_LINK_SECRET=|CRON_SECRET=)' -- . ':!docs/**'
```

Expected: no committed secret assignments.

- [ ] **Step 4: Commit only if verification required a correction**

Use a narrowly named fix commit describing the verified defect.

---

### Task 10: Provision Dedicated Runtime Services and Configure Preview

**Files:**
- No committed secret files.

**Interfaces:**
- Supplies deployment environment variables required by Tasks 3–8.

- [ ] **Step 1: Create or select a dedicated MovieFinder Supabase project**

Do not reuse an unrelated app's database. If a new Supabase project must be created through the connected Supabase tool, first list available organizations and ask the user which organization should own the new MovieFinder project when that choice is required.

- [ ] **Step 2: Apply both MovieFinder migrations to that project**

Apply, in order:

```text
supabase/migrations/20260831_movie_people_credits.sql
supabase/migrations/20260901_anonymous_analytics.sql
```

Then verify `analytics_events` and `analytics_report_runs` exist.

- [ ] **Step 3: Configure a transactional email sender**

Use Resend. Configure a sender allowed by the Resend account. If a custom MovieFinder domain has not yet been purchased/verified, use only a Resend-supported sender configuration that is valid for delivery to the user's Gmail; do not invent a sender domain.

- [ ] **Step 4: Add Preview environment variables in Vercel**

Required names:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ANALYTICS_ID_SECRET
OUTBOUND_LINK_SECRET
ANALYTICS_REPORT_TO
ANALYTICS_REPORT_FROM
RESEND_API_KEY
CRON_SECRET
```

Generate `ANALYTICS_ID_SECRET`, `OUTBOUND_LINK_SECRET`, and `CRON_SECRET` as high-entropy random secrets. Do not display or commit secret values after configuration unless the user explicitly requests to inspect them.

- [ ] **Step 5: Deploy the feature branch to Preview**

Verify the Preview deployment is built from the analytics implementation branch head. Production remains untouched.

---

### Task 11: Preview Acceptance With Real Analytics Events

**Files:**
- No code changes expected unless acceptance finds a defect.

**Interfaces:**
- Proves real Preview traffic reaches the dedicated analytics database and provider redirects still work.

- [ ] **Step 1: Run safe Preview searches**

Use at least:

```text
Where can I watch The Godfather?
Where can I watch the Star Wars movie for free?
Find me a scary movie with a Rotten Tomatoes score of 90% or higher
```

Verify existing result quality remains correct.

- [ ] **Step 2: Verify anonymous event rows**

For those requests, confirm stored rows contain HMAC-looking `visitor_key`/`session_key`, sanitized queries, result counts, and no raw IP/name/email/device-fingerprint columns.

- [ ] **Step 3: Click one valid provider result in Preview**

Verify `/api/out?token=...` returns a temporary redirect to the correct provider destination and that one `provider_click` event is stored with the correct provider/title/access type.

- [ ] **Step 4: Verify tampered redirect is blocked**

Change one token character. Expected: 400 response and no redirect.

- [ ] **Step 5: Manually invoke the weekly-report handler with authorized cron credentials in Preview**

Use an injected/test time only in automated tests. For live Preview, either invoke during an accepted local time window or use a temporary preview-only execution path that is removed before production. Never weaken production cron authorization or time gating merely to test.

Verify the email arrives at the configured Gmail destination and contains only real Preview aggregates.

- [ ] **Step 6: Verify idempotency**

Invoke the same report week again through the authorized path. Expected: no second email after the run is marked `sent`.

- [ ] **Step 7: Re-run `npm test` after any acceptance fix**

Expected: all tests pass.

---

### Task 12: Production Readiness Gate

**Files:**
- No changes unless a verified issue is found.

**Interfaces:**
- Determines whether analytics is safe to promote; does not itself authorize a production promotion.

- [ ] **Step 1: Confirm all required Production environment variables exist**

Do not reuse Preview-only keys unintentionally. Confirm database and email destinations are the intended production ones.

- [ ] **Step 2: Confirm privacy semantics in the email copy**

The report must use `Active anonymous visitors` rather than imply passive homepage page-view tracking.

- [ ] **Step 3: Confirm the production homepage/support UI remains byte-for-byte outside this branch's changes**

No payment/support destination may be modified as part of analytics work.

- [ ] **Step 4: Confirm temporary diagnostics are removed before promotion**

The existing `api/debug-jw.js` diagnostic file should not ship in the final production branch. Removing it is part of the broader MovieFinder promotion gate, not analytics functionality itself.

- [ ] **Step 5: Run the full test suite one final time from the exact commit intended for promotion**

```bash
npm test
```

Expected: zero failures.

- [ ] **Step 6: Do not claim analytics is live until production is freshly verified**

After promotion, verify one real production search logs an anonymous event and provider links still resolve correctly. Until that evidence exists, describe the feature as implemented/Preview-verified, not live.

---

## Spec Coverage Self-Review

- Anonymous searches: Tasks 2–4.
- Anonymous visitor/session identifiers: Task 2.
- Failed/no-result searches: Tasks 3–4.
- Provider/commercial-intent clicks: Task 5.
- No UI/dashboard: Global Constraints and file structure; no frontend file touched.
- First-party MovieFinder database: Tasks 1, 3, 10.
- Monday Gmail report: Tasks 6–8 and 10–11.
- Week-over-week business metrics: Task 6.
- Deterministic opportunities/problems: Task 6.
- Email HTML/plain text: Task 7.
- Privacy/redaction/no raw IP: Tasks 1–4.
- Redirect security/open-redirect prevention: Task 5.
- DST-aware Monday timing: Tasks 6 and 8.
- Duplicate-email prevention: Task 8.
- 90-day raw-event retention: Task 8.
- Analytics failures isolated from search/redirect: Tasks 3–5.
- Preview before production: Tasks 9–12.

No unresolved placeholder or unspecified implementation dependency remains. Real email delivery requires a valid Resend sender and a dedicated MovieFinder Supabase project, both intentionally treated as runtime provisioning rather than hard-coded repository configuration.
