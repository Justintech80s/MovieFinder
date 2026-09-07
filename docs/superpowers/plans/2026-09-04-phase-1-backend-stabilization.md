# MovieFinder Phase 1 Backend Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the existing MovieFinder Node/Vercel and Python/FastAPI backend paths without changing the frontend, while preserving all working search behavior and adding explicit health/readiness coverage, environment validation, bounded external failures, and deterministic fallback behavior.

**Architecture:** Keep Node/Vercel as the public request boundary and existing deterministic search path. Add focused backend utilities for environment validation and subsystem health, expose additive health/readiness endpoints, harden optional dependency fallbacks, and keep Python Cinema Brain optional so failures never break verified deterministic search.

**Tech Stack:** Node.js 20+, Vercel serverless functions, existing Supabase/Postgres integrations, existing Python/FastAPI backend, native Node test runner, pytest for Python tests.

**Spec:** `docs/superpowers/specs/2026-09-04-backend-strengthening-design.md`

## Global Constraints

- No frontend redesign or visual changes.
- No Kubernetes.
- No OpenCV or Whisper.
- No vLLM process inside Vercel.
- No replacement of working deterministic search, current JustWatch availability checks, or existing Cinema Graph APIs.
- Existing MovieFinder result shapes and UI behavior must remain compatible.
- Optional subsystem failures must degrade to the strongest verified deterministic path available.
- A failed availability lookup remains UNKNOWN rather than UNAVAILABLE.
- Secrets must never be logged or returned to clients.
- Vercel production deployment is attempted only after CI passes; account/build-rate limitations are reported accurately rather than treated as application failures.

---

## File map

- Create `lib/config/runtime-config.js`: backend-only environment parsing/validation with no secret disclosure.
- Create `lib/health/status.js`: normalized health/readiness state composition for Node, database, cache, Python, and AI provider.
- Create `api/health.js`: shallow liveness endpoint with no external dependency requirement.
- Create `api/ready.js`: bounded readiness endpoint that reports configured subsystem state without leaking secrets.
- Modify `api/search.js`: consume runtime configuration for timeout/rate-limit values and preserve current public error contract.
- Modify `lib/ai/provider-registry.js`: expose configured provider readiness metadata without exposing keys.
- Create/update Python health files in the existing FastAPI backend after locating its current entry point; add tests adjacent to that backend.
- Create `tests/config/runtime-config.test.js`, `tests/health/status.test.js`, `tests/api/health.test.js`, and `tests/api/ready.test.js`.
- Update `README.md` and `.env.example` only for backend configuration/documentation; no frontend files.

### Task 1: Runtime environment validation

**Files:**
- Create: `lib/config/runtime-config.js`
- Create: `tests/config/runtime-config.test.js`

**Interfaces:**
- Produces: `readRuntimeConfig(env = process.env)` returning a frozen object with numeric timeout/rate-limit fields and boolean subsystem configuration flags.
- Produces: `publicConfigSummary(config)` returning only non-secret readiness-safe metadata.

- [ ] **Step 1: Write the failing tests**

Create `tests/config/runtime-config.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuntimeConfig, publicConfigSummary } from '../../lib/config/runtime-config.js';

test('runtime config applies bounded defaults when optional env values are absent', () => {
  const config=readRuntimeConfig({});
  assert.equal(config.justWatchTimeoutMs,8000);
  assert.equal(config.searchRateLimit,60);
  assert.equal(config.searchRateWindowMs,60000);
  assert.equal(config.databaseConfigured,false);
  assert.equal(config.cacheConfigured,false);
  assert.equal(config.pythonConfigured,false);
});

test('runtime config rejects invalid numeric backend settings', () => {
  assert.throws(()=>readRuntimeConfig({JUSTWATCH_TIMEOUT_MS:'0'}),/JUSTWATCH_TIMEOUT_MS/);
  assert.throws(()=>readRuntimeConfig({SEARCH_RATE_LIMIT:'not-a-number'}),/SEARCH_RATE_LIMIT/);
});

test('public runtime summary never exposes secret values', () => {
  const config=readRuntimeConfig({
    SUPABASE_URL:'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY:'secret-db-key',
    REDIS_URL:'rediss://user:secret@cache.example.com',
    PYTHON_BRAIN_URL:'https://brain.example.com',
    OPENAI_API_KEY:'secret-ai-key',
    OPENAI_MODEL:'gpt-test'
  });
  const summary=publicConfigSummary(config);
  const serialized=JSON.stringify(summary);
  assert.equal(summary.databaseConfigured,true);
  assert.equal(summary.cacheConfigured,true);
  assert.equal(summary.pythonConfigured,true);
  assert.equal(summary.aiConfigured,true);
  assert.doesNotMatch(serialized,/secret-db-key|secret-ai-key|user:secret/);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
node --test tests/config/runtime-config.test.js
```

Expected: FAIL because `lib/config/runtime-config.js` does not exist.

- [ ] **Step 3: Implement the minimal runtime config**

Create `lib/config/runtime-config.js`:

```js
function positiveInt(env,name,fallback,{min=1,max=600000}={}){
  const raw=env?.[name];
  if(raw==null||raw==='') return fallback;
  const value=Number(raw);
  if(!Number.isInteger(value)||value<min||value>max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}

export function readRuntimeConfig(env=process.env){
  const config={
    justWatchTimeoutMs:positiveInt(env,'JUSTWATCH_TIMEOUT_MS',8000,{max:30000}),
    searchRateLimit:positiveInt(env,'SEARCH_RATE_LIMIT',60,{max:10000}),
    searchRateWindowMs:positiveInt(env,'SEARCH_RATE_WINDOW_MS',60000,{max:3600000}),
    databaseConfigured:Boolean(env?.SUPABASE_URL&&(env?.SUPABASE_SERVICE_ROLE_KEY||env?.SUPABASE_ANON_KEY)),
    cacheConfigured:Boolean(env?.REDIS_URL||env?.UPSTASH_REDIS_REST_URL),
    pythonConfigured:Boolean(env?.PYTHON_BRAIN_URL),
    aiConfigured:Boolean(
      (env?.OPENAI_API_KEY&&env?.OPENAI_MODEL)||
      (env?.ANTHROPIC_API_KEY&&env?.ANTHROPIC_MODEL)||
      (env?.GEMINI_API_KEY&&env?.GEMINI_MODEL)||
      (env?.XAI_API_KEY&&env?.XAI_MODEL)
    )
  };
  return Object.freeze(config);
}

export function publicConfigSummary(config){
  return {
    databaseConfigured:Boolean(config?.databaseConfigured),
    cacheConfigured:Boolean(config?.cacheConfigured),
    pythonConfigured:Boolean(config?.pythonConfigured),
    aiConfigured:Boolean(config?.aiConfigured)
  };
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test tests/config/runtime-config.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/config/runtime-config.js tests/config/runtime-config.test.js
git commit -m "feat: validate backend runtime configuration"
```

### Task 2: Node health and readiness state

**Files:**
- Create: `lib/health/status.js`
- Create: `tests/health/status.test.js`

**Interfaces:**
- Consumes: `publicConfigSummary(config)`.
- Produces: `buildHealthStatus({now})`.
- Produces: `buildReadinessStatus({config,checks})` returning `{ready, status, subsystems}`.

- [ ] **Step 1: Write the failing tests**

Create `tests/health/status.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHealthStatus, buildReadinessStatus } from '../../lib/health/status.js';

test('health status is shallow and does not require external systems', () => {
  const result=buildHealthStatus({now:'2026-09-04T17:00:00.000Z'});
  assert.deepEqual(result,{status:'ok',service:'moviefinder-node',time:'2026-09-04T17:00:00.000Z'});
});

test('readiness is true when required Node path is ready even if optional systems are unconfigured', async () => {
  const result=await buildReadinessStatus({
    config:{databaseConfigured:false,cacheConfigured:false,pythonConfigured:false,aiConfigured:false},
    checks:{}
  });
  assert.equal(result.ready,true);
  assert.equal(result.subsystems.node.status,'ready');
  assert.equal(result.subsystems.database.status,'not_configured');
});

test('configured required database failure makes readiness false without exposing error detail', async () => {
  const result=await buildReadinessStatus({
    config:{databaseConfigured:true,cacheConfigured:false,pythonConfigured:false,aiConfigured:false},
    checks:{database:async()=>{throw new Error('postgres://user:secret@db.internal');}}
  });
  assert.equal(result.ready,false);
  assert.equal(result.subsystems.database.status,'unavailable');
  assert.doesNotMatch(JSON.stringify(result),/secret|db\.internal/);
});

test('optional cache Python and AI failures do not make Node search unready', async () => {
  const result=await buildReadinessStatus({
    config:{databaseConfigured:false,cacheConfigured:true,pythonConfigured:true,aiConfigured:true},
    checks:{
      cache:async()=>false,
      python:async()=>false,
      ai:async()=>false
    }
  });
  assert.equal(result.ready,true);
  assert.equal(result.subsystems.cache.status,'unavailable');
  assert.equal(result.subsystems.python.status,'unavailable');
  assert.equal(result.subsystems.ai.status,'unavailable');
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
node --test tests/health/status.test.js
```

Expected: FAIL because `lib/health/status.js` does not exist.

- [ ] **Step 3: Implement minimal status composition**

Create `lib/health/status.js`:

```js
async function safeStatus(configured,check,{required=false}={}){
  if(!configured) return {status:'not_configured',required};
  if(typeof check!=='function') return {status:'unknown',required};
  try{
    const value=await check();
    return {status:value===false?'unavailable':'ready',required};
  }catch{
    return {status:'unavailable',required};
  }
}

export function buildHealthStatus({now=new Date().toISOString()}={}){
  return {status:'ok',service:'moviefinder-node',time:now};
}

export async function buildReadinessStatus({config={},checks={}}={}){
  const subsystems={
    node:{status:'ready',required:true},
    database:await safeStatus(config.databaseConfigured,checks.database,{required:true}),
    cache:await safeStatus(config.cacheConfigured,checks.cache),
    python:await safeStatus(config.pythonConfigured,checks.python),
    ai:await safeStatus(config.aiConfigured,checks.ai)
  };
  const ready=Object.values(subsystems).every(item=>!item.required||['ready','not_configured'].includes(item.status));
  return {ready,status:ready?'ready':'degraded',subsystems};
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test tests/health/status.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/health/status.js tests/health/status.test.js
git commit -m "feat: add backend health readiness state"
```

### Task 3: Node liveness and readiness endpoints

**Files:**
- Create: `api/health.js`
- Create: `api/ready.js`
- Create: `tests/api/health.test.js`
- Create: `tests/api/ready.test.js`

**Interfaces:**
- Consumes: `buildHealthStatus`, `buildReadinessStatus`, `readRuntimeConfig`.
- Produces HTTP JSON endpoints `GET /api/health` and `GET /api/ready`.

- [ ] **Step 1: Write failing endpoint tests**

Create `tests/api/health.test.js` and `tests/api/ready.test.js` using the existing response-recorder pattern:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import healthHandler from '../../api/health.js';

function responseRecorder(){
  return {
    statusCode:200,body:null,headers:{},
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    status(code){this.statusCode=code;return this;},
    json(body){this.body=body;return this;}
  };
}

test('health endpoint is GET-only and returns shallow liveness', async () => {
  const bad=responseRecorder();
  await healthHandler({method:'POST'},bad);
  assert.equal(bad.statusCode,405);

  const good=responseRecorder();
  await healthHandler({method:'GET'},good);
  assert.equal(good.statusCode,200);
  assert.equal(good.body.status,'ok');
  assert.equal(good.headers['cache-control'],'no-store');
});
```

For readiness:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadyHandler } from '../../api/ready.js';

function responseRecorder(){
  return {
    statusCode:200,body:null,headers:{},
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    status(code){this.statusCode=code;return this;},
    json(body){this.body=body;return this;}
  };
}

test('readiness endpoint returns 200 for deterministic-only configuration', async () => {
  const handler=createReadyHandler({env:{}});
  const res=responseRecorder();
  await handler({method:'GET'},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.ready,true);
});

test('readiness endpoint returns 503 when configured required database check fails', async () => {
  const handler=createReadyHandler({
    env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret'},
    checks:{database:async()=>false}
  });
  const res=responseRecorder();
  await handler({method:'GET'},res);
  assert.equal(res.statusCode,503);
  assert.equal(res.body.ready,false);
  assert.doesNotMatch(JSON.stringify(res.body),/secret/);
});
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
node --test tests/api/health.test.js tests/api/ready.test.js
```

Expected: FAIL because the endpoint files do not exist.

- [ ] **Step 3: Implement the endpoints**

Create `api/health.js`:

```js
import { buildHealthStatus } from '../lib/health/status.js';

export default async function handler(req,res){
  res.setHeader('cache-control','no-store');
  res.setHeader('x-content-type-options','nosniff');
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  return res.status(200).json(buildHealthStatus());
}
```

Create `api/ready.js`:

```js
import { readRuntimeConfig } from '../lib/config/runtime-config.js';
import { buildReadinessStatus } from '../lib/health/status.js';

export function createReadyHandler({env=process.env,checks={}}={}){
  return async function handler(req,res){
    res.setHeader('cache-control','no-store');
    res.setHeader('x-content-type-options','nosniff');
    if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
    let config;
    try{
      config=readRuntimeConfig(env);
    }catch{
      return res.status(503).json({ready:false,status:'misconfigured',subsystems:{node:{status:'ready',required:true}}});
    }
    const result=await buildReadinessStatus({config,checks});
    return res.status(result.ready?200:503).json(result);
  };
}

export default createReadyHandler();
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test tests/api/health.test.js tests/api/ready.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/health.js api/ready.js tests/api/health.test.js tests/api/ready.test.js
git commit -m "feat: add Node health and readiness endpoints"
```

### Task 4: Wire runtime config into the existing search boundary

**Files:**
- Modify: `api/search.js`
- Modify: existing search/security tests covering timeout/rate-limit behavior.

**Interfaces:**
- Consumes: `readRuntimeConfig(process.env)`.
- Preserves: current `/api/search` response shape and public error codes.
- Produces no new frontend fields.

- [ ] **Step 1: Add failing tests for environment-driven timeout and safe misconfiguration behavior**

In the existing search security/API test file, add a dependency-injected configuration test proving that valid runtime values are consumed and invalid runtime values return a controlled public error rather than leaking details. Use a fake fetch that captures `AbortSignal` and avoid live network work.

- [ ] **Step 2: Run the targeted search tests**

Run:

```bash
node --test tests/search/api-handler.test.js tests/search/security.test.js
```

Expected: the new tests FAIL because `api/search.js` still uses hard-coded timeout/rate-limit constants.

- [ ] **Step 3: Replace hard-coded values with validated runtime config**

At the top of `api/search.js`, import `readRuntimeConfig`. Resolve configuration once per handler construction rather than repeatedly reading secrets inside helper functions. Preserve the current defaults of 8000 ms for JustWatch timeout and the current search limiter behavior.

Do not alter result rendering, provider cards, or frontend response contracts.

- [ ] **Step 4: Run targeted and full Node tests**

Run:

```bash
node --test tests/search/api-handler.test.js tests/search/security.test.js
npm test
```

Expected: PASS except any explicitly separated live-data test whose external service is unavailable; deterministic CI tests must be green.

- [ ] **Step 5: Commit**

```bash
git add api/search.js tests/search/api-handler.test.js tests/search/security.test.js
git commit -m "refactor: centralize search runtime configuration"
```

### Task 5: AI provider readiness metadata

**Files:**
- Modify: `lib/ai/provider-registry.js`
- Create or modify: `tests/ai/provider-registry.test.js`

**Interfaces:**
- Produces: `configuredProviderNames({env,models})` returning provider names only.
- Preserves: `createProductionModelRouter` behavior.

- [ ] **Step 1: Write failing tests**

Add:

```js
test('configured provider metadata returns names only and never keys', () => {
  const names=configuredProviderNames({
    env:{OPENAI_API_KEY:'secret',ANTHROPIC_API_KEY:'secret2'},
    models:{openai:'gpt-test',anthropic:'claude-test'}
  });
  assert.deepEqual(names,['openai','anthropic']);
  assert.doesNotMatch(JSON.stringify(names),/secret/);
});
```

- [ ] **Step 2: Verify RED**

Run the provider-registry test file. Expected: FAIL because `configuredProviderNames` does not exist.

- [ ] **Step 3: Implement minimal provider metadata helper**

Export a helper that checks the existing provider registry's required key plus model name and returns only provider names in `DEFAULT_PROVIDER_ORDER`.

- [ ] **Step 4: Verify GREEN and full tests**

Run targeted test and `npm test`.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/provider-registry.js tests/ai/provider-registry.test.js
git commit -m "feat: expose safe AI provider readiness metadata"
```

### Task 6: Python/FastAPI health and readiness

**Files:**
- Locate the current FastAPI application entry point before editing.
- Modify only the existing Python backend entry/config files.
- Add tests beside the existing Python tests.

**Interfaces:**
- Produces `GET /health` with shallow liveness.
- Produces `GET /ready` with safe configuration/readiness metadata.
- Does not require Transformers/PyTorch in Phase 1.

- [ ] **Step 1: Locate the FastAPI app and current test command**

Search the repository for `FastAPI(` and identify the current Python test setup. Record the exact entry file and test command in the commit message/body if it differs from the README.

- [ ] **Step 2: Write failing Python tests**

Using FastAPI's `TestClient`, add tests equivalent to:

```python
def test_health_is_shallow(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_ready_does_not_expose_secrets(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "super-secret")
    response = client.get("/ready")
    body = response.json()
    assert "super-secret" not in str(body)
```

- [ ] **Step 3: Run targeted pytest and verify RED**

Run the repository's existing Python test command, targeting only the new health/readiness tests. Expected: FAIL because routes do not exist.

- [ ] **Step 4: Implement minimal FastAPI endpoints**

Add liveness and readiness routes to the existing app. Read only boolean/configuration state. Never return raw environment variables or URLs containing credentials.

- [ ] **Step 5: Run targeted and full Python tests**

Expected: PASS.

- [ ] **Step 6: Commit**

Commit only the Python backend files and tests:

```bash
git commit -m "feat: add Cinema Brain health readiness endpoints"
```

### Task 7: Safe optional subsystem readiness checks

**Files:**
- Modify: `api/ready.js`
- Add focused backend checker modules only if existing Supabase/cache/Python clients cannot be reused cleanly.
- Modify: `tests/api/ready.test.js`

**Interfaces:**
- Database checker: bounded, read-only, no table mutation.
- Cache checker: optional and fail-open for search readiness.
- Python checker: optional HTTP GET to configured `/health` or `/ready`.
- AI checker: reports configured adapter state only; no paid generation call.

- [ ] **Step 1: Write failing tests for bounded checker timeouts and optional failure**

Add tests where fake database/cache/Python checks hang or throw. Use dependency injection so tests finish instantly. Assert database failure produces 503 only when configured/required, while optional cache/Python/AI failure leaves overall readiness true.

- [ ] **Step 2: Verify RED**

Run `node --test tests/api/ready.test.js`. Expected: FAIL until bounded check handling is added.

- [ ] **Step 3: Implement bounded checks**

Use a common timeout wrapper with a small readiness budget (for example 1500 ms per check). Do not call AI generation endpoints. Do not expose thrown error messages.

- [ ] **Step 4: Verify GREEN**

Run targeted and full Node tests.

- [ ] **Step 5: Commit**

```bash
git add api/ready.js lib/health tests/api/ready.test.js
git commit -m "feat: bound backend readiness checks"
```

### Task 8: Backend environment example and documentation

**Files:**
- Create or modify: `.env.example`
- Modify: `README.md`
- Do not modify frontend files.

**Interfaces:**
- Documents only variable names, never real values.

- [ ] **Step 1: Add/update `.env.example`**

Include backend variables that are actually consumed after Tasks 1-7:

```dotenv
JUSTWATCH_TIMEOUT_MS=8000
SEARCH_RATE_LIMIT=60
SEARCH_RATE_WINDOW_MS=60000

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

REDIS_URL=
UPSTASH_REDIS_REST_URL=

PYTHON_BRAIN_URL=

OPENAI_API_KEY=
OPENAI_MODEL=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
GEMINI_API_KEY=
GEMINI_MODEL=
XAI_API_KEY=
XAI_MODEL=
```

- [ ] **Step 2: Update README backend operations section**

Document:
- `/api/health` shallow liveness.
- `/api/ready` dependency readiness.
- Python `/health` and `/ready`.
- Required versus optional backend dependencies.
- Vercel build-rate limits are account/deployment constraints, not application health failures.

- [ ] **Step 3: Run secret scan-style grep before commit**

Run:

```bash
grep -RInE '(sk-[A-Za-z0-9]|service_role.*=.+|redis://[^[:space:]]+:[^[:space:]]+@)' .env.example README.md docs lib api || true
```

Expected: no real credentials.

- [ ] **Step 4: Commit**

```bash
git add .env.example README.md
git commit -m "docs: document backend health and runtime configuration"
```

### Task 9: Full Phase 1 verification and merge gate

**Files:**
- No new production code unless a failing verification test requires a focused fix.
- Frontend files must remain untouched.

**Interfaces:**
- Phase 1 produces a stable backend baseline for later database/ML/hybrid-search phases.

- [ ] **Step 1: Confirm no frontend changes**

Run:

```bash
git diff --name-only <phase-1-base>...HEAD
```

Expected: no `index.html`, CSS, or visual frontend assets.

- [ ] **Step 2: Run the complete Node test suite**

Run:

```bash
npm test
```

Expected: deterministic tests PASS.

- [ ] **Step 3: Run the complete Python test suite**

Run the repository's existing Python test command discovered in Task 6.

Expected: PASS.

- [ ] **Step 4: Run formatting/lint/type checks that already exist in the repository**

Do not invent new toolchains during stabilization. Run only configured project commands, and fix failures caused by Phase 1.

- [ ] **Step 5: Run GitHub Actions**

Require:
- Search Brain Tests: PASS
- CodeQL Security Scan: PASS

- [ ] **Step 6: Merge only after exact-head checks pass**

Use squash merge for the Phase 1 implementation PR.

- [ ] **Step 7: Attempt Vercel production deployment**

Verify the production deployment is built from the merged Phase 1 commit. If Vercel reports `build-rate-limit`, report that exact infrastructure blocker and do not claim the new code is live.

- [ ] **Step 8: Verify live health endpoints after deployment**

Check:
- `https://getmoviefinder.vercel.app/api/health`
- `https://getmoviefinder.vercel.app/api/ready`
- a known title search
- a known person/director search

Expected: endpoints respond correctly and existing search behavior remains compatible.

- [ ] **Step 9: Report Phase 1 completion**

Report:
- Exact files changed.
- Tests and results.
- Environment variables required.
- External services configured/optional.
- Deployment commit and status.
- Live MovieFinder URL if verified.
- Remaining limitations and the next phase.
