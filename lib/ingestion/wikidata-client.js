const ENDPOINT = 'https://www.wikidata.org/w/api.php';
const QID = /^Q\d+$/;
const USER_AGENT = 'MovieFinder/1.0 (https://github.com/Justintech80s/MovieFinder)';

function unavailable(cause) {
  const error = new Error('Wikidata is unavailable', { cause });
  error.code = 'WIKIDATA_UNAVAILABLE';
  error.retryable = true;
  return error;
}

function validateQid(qid) {
  if (!QID.test(String(qid || ''))) throw new TypeError(`invalid Wikidata QID: ${qid}`);
  return String(qid);
}

export function createWikidataClient({ fetchImpl = globalThis.fetch, timeoutMs = 5000, maxRetries = 2 } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('wikidata client requires fetch');

  async function request(qids) {
    const params = new URLSearchParams({
      action: 'wbgetentities',
      format: 'json',
      props: 'labels|descriptions|claims|sitelinks',
      languages: 'en',
      ids: qids.join('|'),
      origin: '*'
    });

    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`${ENDPOINT}?${params}`, {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': USER_AGENT
          }
        });
        if (!response?.ok) throw new Error(`Wikidata HTTP ${response?.status || 'error'}`);
        return await response.json();
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timer);
      }
    }
    throw unavailable(lastError);
  }

  async function fetchEntities(input = []) {
    const qids = [...new Set(input.map(validateQid))];
    if (!qids.length) return { entities: {} };
    if (qids.length > 50) throw new RangeError('wikidata client supports at most 50 entities per request');
    const data = await request(qids);
    return { entities: data?.entities || {} };
  }

  async function fetchSeed(qid) {
    const id = validateQid(qid);
    const { entities } = await fetchEntities([id]);
    return entities[id] || null;
  }

  return { fetchEntities, fetchSeed };
}
