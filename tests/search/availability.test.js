import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOffers, toTimelineEntry } from '../../lib/search/availability.js';

test('adds frontend-compatible priceLabel for paid and free offers', () => {
  const [rent, free] = normalizeOffers([
    { provider: 'Apple TV+', type: 'rent', price: 3.99, currency: 'USD' },
    { provider: 'Tubi', type: 'free', price: null, currency: 'USD' }
  ]);

  assert.equal(rent.priceLabel, '$3.99');
  assert.equal(free.priceLabel, 'Free');
});

test('normalizes current offers to NOW streaming timeline entries', () => {
  const timeline = toTimelineEntry(
    { provider:'Max', type:'FLATRATE', price:null, currency:'USD' },
    { checkedAt:'2026-08-31T00:00:00.000Z', current:true }
  );

  assert.equal(timeline.provider, 'Max');
  assert.equal(timeline.region, 'US');
  assert.equal(timeline.accessType, 'FLATRATE');
  assert.equal(timeline.status, 'NOW');
  assert.equal(timeline.sourceCheckedAt, '2026-08-31T00:00:00.000Z');
});

test('uses supplied future dates for UPCOMING and never guesses when future data is missing', () => {
  const upcoming = toTimelineEntry(
    { provider:'Netflix', type:'FLATRATE', availableFrom:'2026-09-15T00:00:00.000Z' },
    { checkedAt:'2026-08-31T00:00:00.000Z', current:false }
  );
  const unknown = toTimelineEntry(
    { provider:'Netflix', type:'FLATRATE' },
    { checkedAt:'2026-08-31T00:00:00.000Z', current:false }
  );

  assert.equal(upcoming.status, 'UPCOMING');
  assert.equal(upcoming.availableFrom, '2026-09-15T00:00:00.000Z');
  assert.equal(unknown.status, 'UNKNOWN');
  assert.equal(unknown.availableFrom, null);
});
