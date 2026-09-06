const DEFAULT_TIMEOUT_MS = 1500;
const MAX_TIMEOUT_MS = 10_000;
const MAX_GRAPH_DEPTH = 3;
const MAX_GRAPH_RESULTS = 40;

function configuredTimeoutMs(env = {}) {
  const value = Number(env.CINEMA_GRAPH_DB_TIMEOUT_MS);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(100, Math.trunc(value)));
}

function graphNode(row) {
  if (!row) return null;
  const properties = row.properties || {};
  const type = row.entity_type || row.entityType || row.type;
  const name = row.name || row.title || row.canonical_key || row.canonicalKey || row.id;
  return {
    id: row.canonical_key || row.canonicalKey || row.id,
    type,
    name,
    ...(String(type || '').toLowerCase() === 'movie' ? { title: name } : {}),
    description: row.description || null,
    properties,
    year: properties.releaseYear ?? properties.year ?? row.year ?? null
  };
}

function safeLimit(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(number)));
}

export function createSupabaseLiveGraphStore({ fetchImpl = globalThis.fetch, env = process.env } = {}) {
  const base = String(env?.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceKey = String(env?.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!base || !serviceKey || typeof fetchImpl !== 'function') return null;

  const timeoutMs = configuredTimeoutMs(env);
  const canonicalCache = new Map();
  const dbIdCache = new Map();

  function remember(row) {
    if (!row) return null;
    const canonical = row.canonical_key || row.canonicalKey || null;
    if (canonical) canonicalCache.set(canonical, row);
    if (row.id) dbIdCache.set(row.id, row);
    return row;
  }

  async function request(table, params = {}) {
    const url = new URL(`${base}/rest/v1/${table}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        accept: 'application/json'
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) throw new Error(`cinema graph store ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  async function getRowByCanonical(id) {
    if (!id) return null;
    if (canonicalCache.has(id)) return canonicalCache.get(id);
    const rows = await request('cinema_entities', {
      select: '*',
      canonical_key: `eq.${id}`,
      limit: 1
    });
    return remember(rows[0] || null);
  }

  async function findMovieByTitle(title) {
    const value = String(title || '').trim().slice(0, 160);
    if (!value) return null;
    const rows = await request('cinema_entities', {
      select: '*',
      entity_type: 'eq.Movie',
      name: `ilike.${value}`,
      limit: 1
    });
    return graphNode(rows[0] || null);
  }

  async function getNode(id) {
    return graphNode(await getRowByCanonical(id));
  }

  async function rowsByDbIds(ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    const missing = unique.filter(id => !dbIdCache.has(id));
    if (missing.length) {
      const rows = await request('cinema_entities', {
        select: '*',
        id: `in.(${missing.join(',')})`
      });
      for (const row of rows) remember(row);
    }
    return unique.map(id => dbIdCache.get(id)).filter(Boolean);
  }

  async function traverse(startId, { maxDepth = 2, maxResults = 100, direction = 'out' } = {}) {
    const depthLimit = Math.min(MAX_GRAPH_DEPTH, Math.max(0, Math.trunc(Number(maxDepth) || 0)));
    if (!depthLimit) return [];
    const resultLimit = safeLimit(maxResults, MAX_GRAPH_RESULTS, MAX_GRAPH_RESULTS);
    const seed = await getRowByCanonical(startId);
    if (!seed) return [];

    const edges = [];
    const queue = [{ row: seed, depth: 0 }];
    const seen = new Set([seed.canonical_key || seed.canonicalKey || startId]);
    const seenEdges = new Set();

    while (queue.length && edges.length < resultLimit) {
      const current = queue.shift();
      if (current.depth >= depthLimit) continue;
      const remaining = resultLimit - edges.length;
      const relationParams={select:'*',limit:remaining};
      if(direction==='both') relationParams.or=`(from_entity_id.eq.${current.row.id},to_entity_id.eq.${current.row.id})`;
      else if(direction==='in') relationParams.to_entity_id=`eq.${current.row.id}`;
      else relationParams.from_entity_id=`eq.${current.row.id}`;

      const relationRows = await request('cinema_relations', relationParams);
      const endpointIds=relationRows.flatMap(row=>[row.from_entity_id,row.to_entity_id]);
      const endpointRows=await rowsByDbIds(endpointIds);
      const rowByDbId=new Map(endpointRows.map(row=>[row.id,row]));

      for (const relation of relationRows) {
        if (edges.length >= resultLimit) break;
        const fromRow=rowByDbId.get(relation.from_entity_id);
        const toRow=rowByDbId.get(relation.to_entity_id);
        if(!fromRow||!toRow) continue;
        const fromCanonical=fromRow.canonical_key||fromRow.canonicalKey;
        const toCanonical=toRow.canonical_key||toRow.canonicalKey;
        if(!fromCanonical||!toCanonical) continue;
        const edgeKey=`${fromCanonical}|${relation.relation_type||relation.type}|${toCanonical}`;
        if(!seenEdges.has(edgeKey)){
          seenEdges.add(edgeKey);
          edges.push({
            from: fromCanonical,
            to: toCanonical,
            type: relation.relation_type || relation.type,
            properties: relation.properties || {},
            confidence: relation.confidence ?? null
          });
        }
        const neighborId=relation.from_entity_id===current.row.id?relation.to_entity_id:relation.from_entity_id;
        const neighbor=rowByDbId.get(neighborId);
        const neighborCanonical=neighbor?.canonical_key||neighbor?.canonicalKey;
        if(neighbor&&neighborCanonical&&!seen.has(neighborCanonical)){
          seen.add(neighborCanonical);
          queue.push({row:neighbor,depth:current.depth+1});
        }
      }
    }

    return edges;
  }

  return { findMovieByTitle, getNode, traverse };
}
