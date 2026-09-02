const CLAIM_RELATIONS = {
  P161: 'ACTED_IN',
  P57: 'DIRECTED',
  P58: 'WROTE',
  P162: 'PRODUCED',
  P344: 'SHOT_BY',
  P136: 'HAS_GENRE',
  P495: 'FROM_COUNTRY'
};

const MOVIE_INSTANCE_IDS = new Set(['Q11424', 'Q24869', 'Q506240']);
const PERSON_INSTANCE_IDS = new Set(['Q5']);
const SUPPORTED_PROPERTY_IDS = new Set(['P31', 'P577', 'P345', ...Object.keys(CLAIM_RELATIONS)]);

function sourceFor(qid, retrievedAt) {
  return {
    source: 'wikidata',
    externalId: qid,
    sourceUrl: `https://www.wikidata.org/wiki/${qid}`,
    retrievedAt
  };
}

function claimValues(entity, property) {
  return (entity?.claims?.[property] || [])
    .map(claim => claim?.mainsnak?.datavalue?.value)
    .filter(value => value !== undefined && value !== null);
}

function itemIds(entity, property) {
  return claimValues(entity, property)
    .map(value => typeof value === 'object' ? value.id : null)
    .filter(Boolean);
}

function entityType(entity) {
  const instances = itemIds(entity, 'P31');
  if (instances.some(id => MOVIE_INSTANCE_IDS.has(id))) return 'Movie';
  if (instances.some(id => PERSON_INSTANCE_IDS.has(id))) return 'Person';
  return 'Entity';
}

function releaseYear(entity) {
  const time = claimValues(entity, 'P577')[0]?.time;
  const match = typeof time === 'string' ? time.match(/[+-](\d{4,})-/) : null;
  return match ? Number(match[1]) : undefined;
}

function canonicalEntity(entity, retrievedAt) {
  const qid = entity.id;
  const year = releaseYear(entity);
  const imdbId = claimValues(entity, 'P345')[0];
  const properties = {};
  if (Number.isFinite(year)) properties.releaseYear = year;
  if (typeof imdbId === 'string' && imdbId) properties.imdbId = imdbId;

  return {
    canonicalKey: `wikidata:${qid}`,
    entityType: entityType(entity),
    name: entity?.labels?.en?.value || qid,
    description: entity?.descriptions?.en?.value || null,
    properties,
    source: sourceFor(qid, retrievedAt)
  };
}

export function normalizeWikidataBatch({ entities = {}, retrievedAt } = {}) {
  if (!retrievedAt) throw new TypeError('retrievedAt is required');

  const normalizedEntities = [];
  const relations = [];
  const entityKeys = new Set();
  const relationKeys = new Set();
  let skipped = 0;

  for (const entity of Object.values(entities)) {
    if (!entity?.id) {
      skipped += 1;
      continue;
    }

    const normalized = canonicalEntity(entity, retrievedAt);
    if (!entityKeys.has(normalized.canonicalKey)) {
      entityKeys.add(normalized.canonicalKey);
      normalizedEntities.push(normalized);
    }

    for (const property of Object.keys(entity.claims || {})) {
      if (!SUPPORTED_PROPERTY_IDS.has(property)) skipped += 1;
    }

    for (const [property, relationType] of Object.entries(CLAIM_RELATIONS)) {
      for (const targetQid of itemIds(entity, property)) {
        const relation = {
          fromCanonicalKey: `wikidata:${entity.id}`,
          toCanonicalKey: `wikidata:${targetQid}`,
          relationType,
          properties: {},
          confidence: 1,
          source: sourceFor(entity.id, retrievedAt)
        };
        const key = `${relation.fromCanonicalKey}|${relation.relationType}|${relation.toCanonicalKey}`;
        if (relationKeys.has(key)) continue;
        relationKeys.add(key);
        relations.push(relation);
      }
    }
  }

  return { entities: normalizedEntities, relations, skipped };
}
