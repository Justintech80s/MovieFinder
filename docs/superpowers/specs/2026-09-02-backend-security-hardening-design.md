# MovieFinder Backend Security Hardening Design

Date: 2026-09-02
Status: Proposed for implementation

## Goal

Harden MovieFinder's production backend against common API abuse and data-exposure risks while keeping normal movie search public and frictionless.

## Current security baseline

MovieFinder already keeps provider credentials server-side, locks production AI provider identities/endpoints, uses bounded AI-provider timeouts, verifies signed outbound-link tokens, and protects the weekly analytics report with CRON_SECRET. The deterministic Cinema Graph, availability, and provenance layers remain authoritative over AI enrichment.

The public search handler still needs a consistent HTTP security boundary. It currently accepts an unrestricted q value, performs upstream network work, and can expose internal/upstream error detail to clients. Security headers, method enforcement, abuse throttling, and explicit upstream timeouts are not centralized at this boundary.

## Design

### 1. Public search remains public

`GET /api/search` will remain usable without an account or login. Security controls will protect the endpoint without turning MovieFinder into an authenticated-only service.

### 2. Shared API security utilities

Add a small dependency-free security module under `lib/security/` so the existing lightweight Node/Vercel architecture does not require a framework migration.

The module will provide:

- standard defensive response headers;
- HTTP method enforcement helpers;
- bounded string/query validation;
- a lightweight rate-limit interface with injectable storage/clock for deterministic tests;
- safe client-facing error helpers that do not leak secrets, stack traces, upstream payloads, or internal exception messages.

### 3. Search endpoint hardening

`api/search.js` will:

- accept GET only;
- reject missing, malformed, or excessively long search queries before any upstream call;
- apply defensive response headers;
- enforce an abuse budget before expensive external lookups;
- use an AbortSignal timeout for JustWatch requests;
- return stable public error codes/messages while keeping detailed diagnostic information server-side only;
- preserve existing successful search behavior and analytics semantics.

Rate limiting will be designed around an injectable limiter. The default implementation may use per-instance memory as a baseline defense, but the interface must allow a durable/distributed Vercel-compatible store later without rewriting the handler. It must not treat client-controlled forwarding headers as blindly trustworthy identifiers.

### 4. Outbound redirect hardening

`api/out.js` will preserve signed-token verification and add the common defensive headers/method boundary. Redirect destinations remain derived from signed server-generated payloads rather than arbitrary user input.

### 5. Weekly-report hardening

`api/weekly-report.js` will preserve bearer-secret authorization and add the common defensive headers plus an explicit method boundary suitable for the cron invocation.

### 6. Security headers

API responses will use an appropriate baseline such as:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Cache-Control: no-store` for sensitive/error API responses where appropriate
- restrictive framing/content policy headers where compatible with JSON API behavior

Headers must not break the existing browser application or outbound redirect flow.

### 7. Testing strategy

Use TDD. Add regression tests before production changes for:

- unsupported methods;
- oversized/invalid q input rejected before network work;
- rate-limit exhaustion and retry metadata;
- security headers;
- JustWatch timeout normalization;
- no internal error-detail leakage;
- outbound token behavior remains intact;
- weekly report authorization remains intact.

Run the full Node and Python suites plus existing live JustWatch/Wikidata checks through GitHub Actions before considering the branch ready.

### 8. CI security checks

After runtime protections are green, add low-risk repository security automation appropriate to the dependency-light project. Prefer GitHub-native scanning/configuration that does not require application secrets. Any dependency audit step must be deterministic enough not to make normal CI unusably flaky.

## Non-goals for this phase

- Requiring user accounts for public movie search.
- Replacing Vercel or migrating to a heavyweight web framework.
- Building a full identity/authorization system without a product feature that needs it.
- Claiming a single-node in-memory limiter is globally distributed protection; the abstraction is deliberately designed for a stronger shared store later.
- Changing Cinema Graph truth, ranking, or AI provider behavior except where needed to enforce safe request/error boundaries.

## Success criteria

MovieFinder's public backend rejects malformed/abusive requests earlier, limits repeated expensive requests, bounds external network waits, stops exposing internal failure detail, applies consistent API security headers, preserves existing protected cron/outbound behavior, and passes fresh CI regression verification.