import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOffers, toTimelineEntry, isAvailabilityFresh } from '../../lib/search/availability.js';

test('adds frontend-compatible priceLabel for paid and free offers', () => {
  const [rent, free] = normalizeOffers([
    { provider: 'Apple TV+', type: 'rent', price: 3.99, currency: 'USD' },
    { provider: 'Tubi', type: 'free', price: null, currency: 'USD' }
  ]);

  assert.equal(rent.priceLabel, '$3.99');
  assert.equal(free.priceLabel, 'Free');
});

test('preserves provider logo metadata for frontend offer cards', () => {
  const [offer] = normalizeOffers([
    {
      package: {
        clearName: 'Netflix',
        icon: 'https://images.example.com/netflix-icon.png'
      },
      monetizationType: 'flatrate'
    }
  ]);

  assert.equal(offer.provider, 'Netflix');
  assert.equal(offer.providerLogo, 'https://images.example.com/netflix-icon.png');
});

test('accepts alternate upstream provider logo fields', () => {
  const [directLogo, packageLogo] = normalizeOffers([
    { provider: 'Max', type: 'flatrate', logo: 'https://images.example.com/max.png' },
    { provider: 'Hulu', type: 'flatrate', package: { logo: 'https://images.example.com/hulu.png' } }
  ]);

  assert.equal(directLogo.providerLogo, 'https://images.example.com/max.png');
  assert.equal(packageLogo.providerLogo, 'https://images.example.com/hulu.png');
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


test('normalizes relative provider icon paths into usable HTTPS URLs', () => {
  const [offer] = normalizeOffers([
    { provider:'Netflix', type:'flatrate', providerLogo:'/icon/207360008/s100/netflix.png' }
  ]);
  assert.equal(offer.providerLogo,'https://images.justwatch.com/icon/207360008/s100/netflix.png');
});

test('deduplicates provider/type offers while keeping lowest price and available qualities', async () => {
  const { dedupeOffers } = await import('../../lib/search/availability.js');
  const offers = dedupeOffers(normalizeOffers([
    { provider:'Amazon Video', type:'rent', price:4.99, quality:'HD', url:'https://example.com/hd' },
    { provider:'Amazon Video', type:'rent', price:3.99, quality:'SD', url:'https://example.com/sd' },
    { provider:'Amazon Video', type:'rent', price:5.99, quality:'4K', url:'https://example.com/4k' }
  ]));
  assert.equal(offers.length,1);
  assert.equal(offers[0].price,3.99);
  assert.deepEqual(offers[0].qualities,['SD','HD','4K']);
  assert.equal(offers[0].url,'https://example.com/sd');
});

test('rejects unsafe offer URLs from normalized availability data', () => {
  const [offer] = normalizeOffers([{ provider:'Example', type:'buy', price:9.99, url:'javascript:alert(1)' }]);
  assert.equal(offer.url,null);
});


test('resolves JustWatch format placeholders in provider logos', () => {
  const [offer] = normalizeOffers([
    { provider:'Amazon Video', type:'rent', providerLogo:'https://images.justwatch.com/icon/340823436/s100/amazon.{format}' }
  ]);
  assert.equal(offer.providerLogo,'https://images.justwatch.com/icon/340823436/s100/amazon.png');
});

test('normalizes JustWatch quality codes for display and filtering', async () => {
  const { dedupeOffers } = await import('../../lib/search/availability.js');
  const offers=dedupeOffers(normalizeOffers([
    {provider:'Amazon Video',type:'rent',price:4.99,quality:'_4K'},
    {provider:'Amazon Video',type:'rent',price:5.99,quality:'HD'},
    {provider:'Amazon DVD / Blu-ray',type:'buy',price:16.70,quality:'BLURAY_4K'}
  ]));
  assert.equal(offers[0].quality,'4K');
  assert.deepEqual(offers[0].qualities,['HD','4K']);
  assert.equal(offers[1].quality,'4K Blu-ray');
  assert.deepEqual(offers[1].qualities,['4K Blu-ray']);
});


test('marks generic provider homepages as non-title-specific destinations', () => {
  const [offer]=normalizeOffers([
    {provider:'Netflix',type:'flatrate',url:'https://www.netflix.com/'}
  ]);
  assert.equal(offer.url,'https://www.netflix.com/');
  assert.equal(offer.linkSpecificity,'GENERIC');
  assert.equal(offer.titleSpecificUrl,null);
});

test('preserves deep provider title links as title-specific destinations', () => {
  const [offer]=normalizeOffers([
    {provider:'Netflix',type:'flatrate',url:'https://www.netflix.com/title/70143836'}
  ]);
  assert.equal(offer.linkSpecificity,'TITLE');
  assert.equal(offer.titleSpecificUrl,'https://www.netflix.com/title/70143836');
});

test('rejects credential-bearing and local-network provider URLs', () => {
  const offers=normalizeOffers([
    {provider:'Example',type:'buy',url:'https://user:pass@example.com/title/1'},
    {provider:'Example',type:'buy',url:'http://127.0.0.1/title/1'},
    {provider:'Example',type:'buy',url:'http://localhost/title/1'}
  ]);
  assert.deepEqual(offers.map(x=>x.url),[null,null,null]);
});

test('availability freshness expires current offers on a short TTL', () => {
  assert.equal(isAvailabilityFresh('2026-09-04T16:00:00.000Z','2026-09-04T16:04:59.000Z'),true);
  assert.equal(isAvailabilityFresh('2026-09-04T16:00:00.000Z','2026-09-04T16:05:01.000Z'),false);
  assert.equal(isAvailabilityFresh(null,'2026-09-04T16:05:01.000Z'),false);
});
