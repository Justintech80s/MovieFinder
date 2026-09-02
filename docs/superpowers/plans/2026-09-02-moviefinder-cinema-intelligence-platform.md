# MovieFinder Cinema Intelligence Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a backward-compatible cinema-intelligence layer that turns natural-language movie questions into structured plans, traverses explicit cinema relationships, verifies results, and exposes provider-neutral AI hooks without changing MovieFinder's visual design.

**Architecture:** Keep MovieFinder's deterministic Node search core as the authority for constraints, filmography, availability, graph relations, evidence, and ranking. Add narrowly scoped graph, planning, orchestration, verification, and model-router modules under `lib/search`, preserving existing exports and result shapes while adding optional intelligence metadata.

**Tech Stack:** Node.js >=20, ECMAScript modules, built-in `node:test`, existing MovieFinder JavaScript search modules, existing Python/FastAPI backend left compatible, Vercel deployment, optional external model providers behind adapters.

**Spec:** `docs/superpowers/specs/2026-09-02-moviefinder-cinema-intelligence-platform-design.md`

## Global Constraints

- Do not redesign MovieFinder's UI.
- Existing filmography, availability, intent, ranking, and API behavior must remain compatible.
- No external AI provider may be mandatory for deterministic searches.
- Do not commit API keys or credentials.
- Streaming availability must preserve region and freshness/verification state.
- Unknown availability must not be silently converted to unavailable.
- New result metadata must be additive.
- Use TDD for every task and run the full Node test suite before merge.

---

## File Structure

- `lib/search/cinema-graph.js` — backward-compatible concept scoring plus graph facade exports.
- `lib/search/graph-store.js` — in-memory node/edge store, deduplication, neighbors, bounded traversal, path explanations.
- `lib/search/query-plan.js` — deterministic conversion from current parsed intent into a serializable execution plan.
- `lib/search/model-router.js` — provider registration, capability checks, explicit selection, fallback, timeout/error normalization.
- `lib/search/evidence.js` — evidence normalization, confidence aggregation, verified/unknown states.
- `lib/search/cinema-knowledge.js` — graph-backed relation and similarity lookup service.
- `lib/search/verification.js` — attaches evidence/confidence and preserves availability uncertainty.
- `lib/search/orchestrator.js` — composes existing filmography/availability modules with query-plan, graph, ranking, and verification.
- `tests/search/cinema-graph.test.js` — graph behavior and legacy scoring regression.
- `tests/search/query-plan.test.js` — deterministic plan generation.
- `tests/search/model-router.test.js` — provider selection/fallback/error normalization.
- `tests/search/evidence.test.js` — evidence/confidence semantics.
- `tests/search/orchestrator.test.js` — integration fixtures and compatibility.
- `README.md` — truthful public positioning, architecture, examples, setup, test instructions, roadmap boundaries.

---

### Task 1: Build the backward-compatible Cinema Graph core

**Files:**
- Create: `lib/search/graph-store.js`
- Modify: `lib/search/cinema-graph.js`
- Create: `tests/search/cinema-graph.test.js`

**Interfaces:**
- Produces: `createGraphStore()`, `addNode(node)`, `addEdge(edge)`, `getNode(id)`, `neighbors(id, options)`, `traverse(startId, options)`, `explainPath(fromId, toId, options)`.
- Preserves: `extractCinemaConcepts(query)` and `scoreCinemaRelations(movie, intent)`.

- [ ] **Step 1: Write failing graph tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphStore } from '../../lib/search/graph-store.js';
import { extractCinemaConcepts, scoreCinemaRelations } from '../../lib/search/cinema-graph.js';

test('deduplicates nodes and edges and explains a path', () => {
  const graph = createGraphStore();
  graph.addNode({ id: 'person:gene-hackman', type: 'Person', name: 'Gene Hackman' });
  graph.addNode({ id: 'movie:conversation', type: 'Movie', title: 'The Conversation' });
  graph.addNode({ id: 'movie:conversation', type: 'Movie', title: 'The Conversation' });
  graph.addEdge({ from: 'person:gene-hackman', to: 'movie:conversation', type: 'ACTED_IN' });
  graph.addEdge({ from: 'person:gene-hackman', to: 'movie:conversation', type: 'ACTED_IN' });
  assert.equal(graph.nodes().length, 2);
  assert.equal(graph.edges().length, 1);
  assert.deepEqual(graph.explainPath('person:gene-hackman', 'movie:conversation'), {
    nodes: ['person:gene-hackman', 'movie:conversation'],
    edges: ['ACTED_IN']
  });
});

test('legacy cinema concept scoring remains available', () => {
  assert.deepEqual(extractCinemaConcepts('gritty New Hollywood crime'), ['new hollywood', 'gritty']);
  const result = scoreCinemaRelations({ title: 'X', genres: ['crime'], tags: ['gritty'] }, { raw: 'gritty' });
  assert.ok(result.score > 0);
});
```

- [ ] **Step 2: Run the targeted test and verify failure**

Run: `node --test tests/search/cinema-graph.test.js`
Expected: FAIL because `graph-store.js` does not exist.

- [ ] **Step 3: Implement the minimal graph store**

```js
const edgeKey = e => `${e.from}|${e.type}|${e.to}`;

export function createGraphStore() {
  const nodeMap = new Map();
  const edgeMap = new Map();

  function addNode(node) {
    if (!node?.id || !node?.type) throw new TypeError('graph node requires id and type');
    nodeMap.set(node.id, { ...(nodeMap.get(node.id) || {}), ...node });
    return nodeMap.get(node.id);
  }

  function addEdge(edge) {
    if (!edge?.from || !edge?.to || !edge?.type) throw new TypeError('graph edge requires from, to, and type');
    if (!nodeMap.has(edge.from) || !nodeMap.has(edge.to)) throw new Error('graph edge references unknown node');
    edgeMap.set(edgeKey(edge), { ...edge });
    return edgeMap.get(edgeKey(edge));
  }

  function neighbors(id, { type, direction = 'both' } = {}) {
    return [...edgeMap.values()].filter(edge => {
      const touches = direction === 'out' ? edge.from === id : direction === 'in' ? edge.to === id : edge.from === id || edge.to === id;
      return touches && (!type || edge.type === type);
    });
  }

  function explainPath(fromId, toId, { maxDepth = 4 } = {}) {
    const queue = [{ id: fromId, nodes: [fromId], edges: [] }];
    const seen = new Set([fromId]);
    while (queue.length) {
      const current = queue.shift();
      if (current.id === toId) return { nodes: current.nodes, edges: current.edges };
      if (current.edges.length >= maxDepth) continue;
      for (const edge of neighbors(current.id, { direction: 'out' })) {
        if (seen.has(edge.to)) continue;
        seen.add(edge.to);
        queue.push({ id: edge.to, nodes: [...current.nodes, edge.to], edges: [...current.edges, edge.type] });
      }
    }
    return null;
  }

  function traverse(startId, { maxDepth = 2, edgeTypes } = {}) {
    const matches = [];
    const queue = [{ id: startId, depth: 0 }];
    const seen = new Set([startId]);
    while (queue.length) {
      const current = queue.shift();
      if (current.depth >= maxDepth) continue;
      for (const edge of neighbors(current.id, { direction: 'out' })) {
        if (edgeTypes?.length && !edgeTypes.includes(edge.type)) continue;
        matches.push(edge);
        if (!seen.has(edge.to)) {
          seen.add(edge.to);
          queue.push({ id: edge.to, depth: current.depth + 1 });
        }
      }
    }
    return matches;
  }

  return { addNode, addEdge, getNode: id => nodeMap.get(id) || null, nodes: () => [...nodeMap.values()], edges: () => [...edgeMap.values()], neighbors, traverse, explainPath };
}
```

Update `cinema-graph.js` only to export graph helpers or create a default graph facade; retain the existing `CONCEPTS`, `extractCinemaConcepts`, and `scoreCinemaRelations` behavior unchanged.

- [ ] **Step 4: Run targeted and full tests**

Run: `node --test tests/search/cinema-graph.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/search/graph-store.js lib/search/cinema-graph.js tests/search/cinema-graph.test.js
git commit -m "feat: add backward-compatible cinema graph core"
```

---

### Task 2: Add deterministic Film Query Plans

**Files:**
- Create: `lib/search/query-plan.js`
- Create: `tests/search/query-plan.test.js`
- Read/consume: `lib/search/intent.js`, `lib/search/constraints.js`

**Interfaces:**
- Consumes: current parsed intent object.
- Produces: `buildQueryPlan(intent, context = {}) -> QueryPlan` and `validateQueryPlan(plan) -> QueryPlan`.

- [ ] **Step 1: Write failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQueryPlan, validateQueryPlan } from '../../lib/search/query-plan.js';

test('builds a serializable actor-era-availability plan', () => {
  const plan = buildQueryPlan({ raw: 'Gene Hackman 1970s political thrillers streaming', people: ['Gene Hackman'], genres: ['thriller'], concepts: ['paranoid'] }, { region: 'US' });
  assert.equal(plan.workType, 'movie');
  assert.deepEqual(plan.people, ['Gene Hackman']);
  assert.equal(plan.availability.required, true);
  assert.equal(plan.availability.region, 'US');
  assert.equal(JSON.parse(JSON.stringify(plan)).version, 1);
});

test('rejects empty plans', () => {
  assert.throws(() => validateQueryPlan({ version: 1, raw: '' }), /query plan requires/);
});
```

- [ ] **Step 2: Verify failure**

Run: `node --test tests/search/query-plan.test.js`
Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement the plan builder**

```js
const streamingRequested = raw => /\b(stream|streaming|watch|available)\b/i.test(String(raw || ''));

export function buildQueryPlan(intent = {}, context = {}) {
  const raw = String(intent.raw || '').trim();
  const plan = {
    version: 1,
    raw,
    workType: intent.workType || 'movie',
    people: [...new Set(intent.people || [])],
    genres: [...new Set(intent.genres || [])],
    concepts: [...new Set(intent.concepts || [])],
    years: intent.years || intent.yearRange || null,
    similarityAnchor: intent.similarityAnchor || null,
    availability: {
      required: Boolean(intent.streamingOnly || streamingRequested(raw)),
      region: context.region || intent.region || 'US'
    },
    verificationRequired: true
  };
  return validateQueryPlan(plan);
}

export function validateQueryPlan(plan) {
  if (!plan || typeof plan !== 'object' || !String(plan.raw || '').trim()) throw new TypeError('query plan requires a non-empty raw query');
  if (plan.version !== 1) throw new TypeError('query plan requires version 1');
  return plan;
}
```

- [ ] **Step 4: Run targeted and full tests**

Run: `node --test tests/search/query-plan.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/search/query-plan.js tests/search/query-plan.test.js
git commit -m "feat: add structured film query plans"
```

---

### Task 3: Add provider-neutral model routing

**Files:**
- Create: `lib/search/model-router.js`
- Create: `tests/search/model-router.test.js`

**Interfaces:**
- Produces: `createModelRouter({ timeoutMs })` with `register(name, adapter)`, `providers()`, and `run(capability, input, options)`.
- Adapter contract: `{ capabilities: string[], invoke(capability, input, options): Promise<unknown> }`.

- [ ] **Step 1: Write failing tests for explicit selection and fallback**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelRouter } from '../../lib/search/model-router.js';

test('falls back to the next capable provider', async () => {
  const router = createModelRouter({ timeoutMs: 100 });
  router.register('first', { capabilities: ['semantic'], invoke: async () => { throw new Error('down'); } });
  router.register('second', { capabilities: ['semantic'], invoke: async () => ({ concepts: ['paranoid'] }) });
  const result = await router.run('semantic', { query: 'conspiracy films' });
  assert.equal(result.provider, 'second');
  assert.deepEqual(result.output, { concepts: ['paranoid'] });
});

test('returns normalized failure when no provider can satisfy capability', async () => {
  const router = createModelRouter();
  await assert.rejects(router.run('vision', {}), error => error.code === 'MODEL_PROVIDER_UNAVAILABLE');
});
```

- [ ] **Step 2: Verify failure**

Run: `node --test tests/search/model-router.test.js`
Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement registration, capability filtering, timeout, fallback, and normalized errors**

```js
export function createModelRouter({ timeoutMs = 5000 } = {}) {
  const registry = new Map();
  const register = (name, adapter) => { registry.set(name, adapter); return name; };
  const providers = () => [...registry.keys()];

  async function run(capability, input, { provider, order } = {}) {
    const names = provider ? [provider] : order?.length ? order : providers();
    const candidates = names.filter(name => registry.get(name)?.capabilities?.includes(capability));
    const failures = [];
    for (const name of candidates) {
      const adapter = registry.get(name);
      try {
        const output = await Promise.race([
          adapter.invoke(capability, input, { provider: name }),
          new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('model provider timeout'), { code: 'MODEL_PROVIDER_TIMEOUT' })), timeoutMs))
        ]);
        return { provider: name, output };
      } catch (error) {
        failures.push({ provider: name, code: error.code || 'MODEL_PROVIDER_ERROR', message: error.message });
      }
    }
    const error = Object.assign(new Error('no model provider available for capability'), { code: 'MODEL_PROVIDER_UNAVAILABLE', failures });
    throw error;
  }

  return { register, providers, run };
}
```

- [ ] **Step 4: Run targeted and full tests**

Run: `node --test tests/search/model-router.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/search/model-router.js tests/search/model-router.test.js
git commit -m "feat: add provider-neutral model router"
```

---

### Task 4: Add evidence, confidence, and verification semantics

**Files:**
- Create: `lib/search/evidence.js`
- Create: `lib/search/verification.js`
- Create: `tests/search/evidence.test.js`

**Interfaces:**
- Produces: `normalizeEvidence(item)`, `aggregateConfidence(evidence)`, `verifyMatch(match, evidence, options)`.

- [ ] **Step 1: Write failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateConfidence } from '../../lib/search/evidence.js';
import { verifyMatch } from '../../lib/search/verification.js';

test('unknown availability stays unknown', () => {
  const result = verifyMatch({ title: 'Example', availability: null }, [], { availabilityRequested: true, region: 'US' });
  assert.equal(result.verification.availability.state, 'unknown');
  assert.equal(result.verification.availability.region, 'US');
});

test('confidence is bounded and driven by evidence quality', () => {
  assert.equal(aggregateConfidence([{ quality: 1 }, { quality: 0.5 }]), 0.75);
  assert.equal(aggregateConfidence([]), 0);
});
```

- [ ] **Step 2: Verify failure**

Run: `node --test tests/search/evidence.test.js`
Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement evidence normalization and verification**

```js
export function normalizeEvidence(item = {}) {
  return {
    source: item.source || 'unknown',
    kind: item.kind || 'fact',
    claim: item.claim || null,
    value: item.value,
    quality: Math.max(0, Math.min(1, Number(item.quality ?? 0.5))),
    observedAt: item.observedAt || null
  };
}

export function aggregateConfidence(items = []) {
  if (!items.length) return 0;
  const values = items.map(normalizeEvidence).map(item => item.quality);
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3));
}
```

```js
import { aggregateConfidence, normalizeEvidence } from './evidence.js';

export function verifyMatch(match, evidence = [], { availabilityRequested = false, region = 'US' } = {}) {
  const normalized = evidence.map(normalizeEvidence);
  const availabilityState = !availabilityRequested ? 'not_requested' : match.availability == null ? 'unknown' : match.availability === false ? 'unavailable' : 'available';
  return {
    ...match,
    evidence: normalized,
    confidence: aggregateConfidence(normalized),
    verification: {
      availability: { state: availabilityState, region },
      verifiedAt: new Date().toISOString()
    }
  };
}
```

- [ ] **Step 4: Run targeted and full tests**

Run: `node --test tests/search/evidence.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/search/evidence.js lib/search/verification.js tests/search/evidence.test.js
git commit -m "feat: add evidence and verification metadata"
```

---

### Task 5: Add cinema-knowledge service and orchestrator integration

**Files:**
- Create: `lib/search/cinema-knowledge.js`
- Create: `lib/search/orchestrator.js`
- Create: `tests/search/orchestrator.test.js`
- Consume without breaking: `lib/search/filmography.js`, `lib/search/availability.js`, `lib/search/rank.js`, `lib/search/intent.js`, `lib/search/person-search.js`

**Interfaces:**
- Produces: `createCinemaKnowledge({ graph })` with `relations(id, options)` and `explain(fromId, toId, options)`.
- Produces: `createSearchOrchestrator(deps)` with `search(query, context)`.

- [ ] **Step 1: Write integration tests using dependency injection**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchOrchestrator } from '../../lib/search/orchestrator.js';

test('orchestrator returns compatible results plus intelligence metadata', async () => {
  const orchestrator = createSearchOrchestrator({
    parseIntent: query => ({ raw: query, people: ['Gene Hackman'], genres: ['thriller'] }),
    findFilmography: async () => [{ id: 'movie:conversation', title: 'The Conversation', year: 1974 }],
    checkAvailability: async movie => ({ ...movie, availability: { provider: 'Example', region: 'US' } }),
    rankResults: items => items,
    relationEvidence: movie => [{ source: 'cinema-graph', kind: 'relation', claim: 'actor credit', value: movie.id, quality: 1 }]
  });
  const response = await orchestrator.search('Gene Hackman thrillers streaming', { region: 'US' });
  assert.equal(response.results[0].title, 'The Conversation');
  assert.ok(Array.isArray(response.results[0].evidence));
  assert.equal(response.plan.version, 1);
});
```

- [ ] **Step 2: Verify failure**

Run: `node --test tests/search/orchestrator.test.js`
Expected: FAIL because orchestrator does not exist.

- [ ] **Step 3: Implement graph knowledge wrapper and orchestrator**

```js
export function createCinemaKnowledge({ graph }) {
  return {
    relations: (id, options = {}) => graph.traverse(id, options),
    explain: (fromId, toId, options = {}) => graph.explainPath(fromId, toId, options)
  };
}
```

```js
import { buildQueryPlan } from './query-plan.js';
import { verifyMatch } from './verification.js';

export function createSearchOrchestrator({ parseIntent, findFilmography, checkAvailability, rankResults, relationEvidence = () => [] }) {
  return {
    async search(query, context = {}) {
      const intent = await parseIntent(query, context);
      const plan = buildQueryPlan(intent, context);
      let results = await findFilmography(plan, context);
      if (plan.availability.required) results = await Promise.all(results.map(movie => checkAvailability(movie, plan.availability)));
      results = rankResults(results, plan);
      results = results.map(movie => verifyMatch(movie, relationEvidence(movie, plan), { availabilityRequested: plan.availability.required, region: plan.availability.region }));
      return { query, plan, results };
    }
  };
}
```

Then add a production factory or adapter in `orchestrator.js` that wires these dependency slots to the signatures actually exported by MovieFinder's existing modules. Do not rewrite the existing modules merely to fit the orchestrator; adapt at the boundary.

- [ ] **Step 4: Run integration, regression, and full tests**

Run: `node --test tests/search/orchestrator.test.js tests/search/filmography.test.js tests/search/availability.test.js tests/search/api-handler.test.js && npm test`
Expected: PASS with existing API contracts unchanged.

- [ ] **Step 5: Commit**

```bash
git add lib/search/cinema-knowledge.js lib/search/orchestrator.js tests/search/orchestrator.test.js
git commit -m "feat: orchestrate evidence-backed cinema intelligence"
```

---

### Task 6: Publish a truthful developer-facing README and final verification

**Files:**
- Create: `README.md`
- Optionally modify only if required by discovered public entry points: `package.json`
- Read: all new modules and existing setup files.

**Interfaces:**
- Public documentation must name only exports that exist after Tasks 1-5.

- [ ] **Step 1: Write README content with one verified complex-query example**

README must include this opening positioning:

```md
# MovieFinder

MovieFinder is a cinema-intelligence search engine for questions that ordinary streaming search handles poorly: filmographies, eras, genres, creative relationships, stylistic connections, and current availability.
```

Include an architecture block matching the implemented flow:

```text
Natural-language query
        ↓
Intent parser → Query plan
        ↓
Filmography + Cinema Graph + Availability
        ↓
Ranking → Verification/Evidence
        ↓
MovieFinder-compatible results
```

Include an example using actual exported APIs such as:

```js
import { buildQueryPlan } from './lib/search/query-plan.js';

const plan = buildQueryPlan({
  raw: 'Gene Hackman 1970s political thrillers streaming',
  people: ['Gene Hackman'],
  genres: ['thriller'],
  concepts: ['paranoid']
}, { region: 'US' });
```

Document `npm test`, Node >=20, current limitations, and a roadmap section that clearly labels proprietary-model training, dedicated graph databases, and broader provider adapters as future work.

- [ ] **Step 2: Verify every README path/export against the repository**

Run: `node -e "import('./lib/search/query-plan.js').then(m=>console.log(Object.keys(m)))"`
Expected: output includes `buildQueryPlan` and `validateQueryPlan`.

Run: `node -e "import('./lib/search/graph-store.js').then(m=>console.log(Object.keys(m)))"`
Expected: output includes `createGraphStore`.

- [ ] **Step 3: Run the complete test suite**

Run: `npm test`
Expected: all existing and new tests PASS.

- [ ] **Step 4: Inspect branch diff for scope violations**

Run: `git diff main...HEAD --stat && git diff main...HEAD -- README.md package.json lib/search tests/search`
Expected: no UI redesign, no credentials, no unrelated refactors, no claims of unimplemented capabilities.

- [ ] **Step 5: Commit README**

```bash
git add README.md package.json
git commit -m "docs: present MovieFinder as cinema intelligence infrastructure"
```

- [ ] **Step 6: Final branch verification**

Run: `npm test && git status --short`
Expected: all tests PASS and working tree is clean.

- [ ] **Step 7: Open pull request**

PR title: `Build MovieFinder cinema intelligence platform`

PR body must summarize implemented graph/query-plan/router/evidence/orchestrator work, explicitly say the UI was not redesigned, list test commands/results, and distinguish implemented capabilities from roadmap items.
