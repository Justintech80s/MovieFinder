import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOffers } from '../../lib/search/availability.js';

test('adds frontend-compatible priceLabel for paid and free offers', () => {
  const [rent, free] = normalizeOffers([
    { provider: 'Apple TV+', type: 'rent', price: 3.99, currency: 'USD' },
    { provider: 'Tubi', type: 'free', price: null, currency: 'USD' }
  ]);

  assert.equal(rent.priceLabel, '$3.99');
  assert.equal(free.priceLabel, 'Free');
});
