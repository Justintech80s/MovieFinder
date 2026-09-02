import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateConfidence } from '../../lib/search/evidence.js';
import { verifyMatch } from '../../lib/search/verification.js';

test('unknown availability stays unknown', () => {
  const result = verifyMatch({ title: 'Example', availability: null }, [], { availabilityRequested: true, region: 'US', now: () => new Date('2026-09-02T12:00:00Z') });
  assert.equal(result.verification.availability.state, 'unknown');
  assert.equal(result.verification.availability.region, 'US');
});

test('false availability is distinct from unknown', () => {
  const result = verifyMatch({ title: 'Example', availability: false }, [], { availabilityRequested: true });
  assert.equal(result.verification.availability.state, 'unavailable');
});

test('confidence is bounded and driven by evidence quality', () => {
  assert.equal(aggregateConfidence([{ quality: 1 }, { quality: 0.5 }]), 0.75);
  assert.equal(aggregateConfidence([{ quality: 2 }, { quality: -1 }]), 0.5);
  assert.equal(aggregateConfidence([]), 0);
});
