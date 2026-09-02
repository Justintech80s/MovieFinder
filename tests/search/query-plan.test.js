import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQueryPlan, validateQueryPlan } from '../../lib/search/query-plan.js';

test('builds a serializable actor-era-availability plan', () => {
  const plan = buildQueryPlan({ raw: 'Gene Hackman 1970s political thrillers streaming', people: ['Gene Hackman'], genres: ['thriller'], concepts: ['paranoid'], yearRange: { min: 1970, max: 1979 } }, { region: 'US' });
  assert.equal(plan.workType, 'movie');
  assert.deepEqual(plan.people, ['Gene Hackman']);
  assert.deepEqual(plan.years, { min: 1970, max: 1979 });
  assert.equal(plan.availability.required, true);
  assert.equal(plan.availability.region, 'US');
  assert.equal(JSON.parse(JSON.stringify(plan)).version, 1);
});

test('rejects empty plans', () => {
  assert.throws(() => validateQueryPlan({ version: 1, raw: '' }), /query plan requires/);
});
