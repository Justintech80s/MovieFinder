function requireDb(db) {
  if (!db?.from) throw new TypeError('cinema graph repository requires db client');
  return db;
}

function throwIfError(result, operation) {
  if (result?.error) {
    const error = new Error(`${operation}: ${result.error.message || 'database error'}`);
    error.cause = result.error;
    throw error;
  }
  return result?.data ?? null;
}

function qidFromCanonicalKey(key = '') {
  const [source, externalId] = String(key).split(':', 2);
  return { source, externalId };
}

export function createCinemaGraphRepository({ db } = {}) {
  const client = requireDb(db);

  async function upsertEntity(entity) {
    if (!entity?.canonicalKey || !entity?.entityType) throw new TypeError('entity requires canonicalKey and entityType');
    return throwIfError(await client.from('cinema_entities').upsert({
      canonical_key: entity.canonicalKey,
      entity_type: entity.entityType,
      name: entity.name || entity.canonicalKey,
      description: entity.description || null,
      properties: entity.properties || {},
      updated_at: new Date().toISOString()
    }).select().single(), 'upsert cinema entity');
  }

  async function upsertEntitySource(entityId, source) {
    return throwIfError(await client.from('cinema_entity_sources').upsert({
      entity_id: entityId,
      source: source.source,
      external_id: source.externalId,
      source_url: source.sourceUrl || null,
      retrieved_at: source.retrievedAt || new Date().toISOString(),
      payload_hash: source.payloadHash || null
    }).select().single(), 'upsert cinema entity source');
  }

  async function getEntity(idOrCanonicalKey) {
    const column = String(idOrCanonicalKey).includes(':') ? 'canonical_key' : 'id';
    return throwIfError(await client.from('cinema_entities').select('*').eq(column, idOrCanonicalKey).maybeSingle(), 'get cinema entity');
  }

  async function listEntities() {
    return throwIfError(await client.from('cinema_entities').select('*'), 'list cinema entities') || [];
  }

  async function upsertRelation(relation) {
    const from = relation.fromEntityId ? { id: relation.fromEntityId } : await getEntity(relation.fromCanonicalKey);
    const to = relation.toEntityId ? { id: relation.toEntityId } : await getEntity(relation.toCanonicalKey);
    if (!from || !to) throw new Error('cinema relation references unknown entity');
    return throwIfError(await client.from('cinema_relations').upsert({
      from_entity_id: from.id,
      to_entity_id: to.id,
      relation_type: relation.relationType || relation.type,
      properties: relation.properties || {},
      confidence: relation.confidence ?? null,
      updated_at: new Date().toISOString()
    }).select().single(), 'upsert cinema relation');
  }

  async function upsertRelationSource(relationId, source) {
    return throwIfError(await client.from('cinema_relation_sources').upsert({
      relation_id: relationId,
      source: source.source,
      external_id: source.externalId,
      source_url: source.sourceUrl || null,
      retrieved_at: source.retrievedAt || new Date().toISOString()
    }).select().single(), 'upsert cinema relation source');
  }

  async function listRelations() {
    return throwIfError(await client.from('cinema_relations').select('*'), 'list cinema relations') || [];
  }

  async function listOutgoingRelations(entityId, type) {
    let query = client.from('cinema_relations').select('*').eq('from_entity_id', entityId);
    if (type) query = query.eq('relation_type', type);
    return throwIfError(await query, 'list outgoing cinema relations') || [];
  }

  async function getRelationSources(relationId) {
    return throwIfError(await client.from('cinema_relation_sources').select('*').eq('relation_id', relationId), 'list relation sources') || [];
  }

  async function createOrResumeJob({ source, jobType, seedExternalId }) {
    const existing = throwIfError(await client.from('cinema_ingestion_jobs').select('*')
      .eq('source', source).eq('job_type', jobType).eq('seed_external_id', seedExternalId).maybeSingle(), 'find ingestion job');
    if (existing && !['completed'].includes(existing.status)) return existing;
    return throwIfError(await client.from('cinema_ingestion_jobs').insert({
      source,
      job_type: jobType,
      seed_external_id: seedExternalId,
      status: 'running',
      checkpoint: {},
      stats: {},
      started_at: new Date().toISOString()
    }).select().single(), 'create ingestion job');
  }

  async function updateJobCheckpoint(jobId, { checkpoint, stats, status, error } = {}) {
    const patch = { updated_at: new Date().toISOString() };
    if (checkpoint !== undefined) patch.checkpoint = checkpoint;
    if (stats !== undefined) patch.stats = stats;
    if (status !== undefined) patch.status = status;
    if (error !== undefined) patch.error = error;
    if (status === 'completed') patch.completed_at = new Date().toISOString();
    return throwIfError(await client.from('cinema_ingestion_jobs').update(patch).eq('id', jobId).select().single(), 'update ingestion job');
  }

  async function mirrorLegacyEntity(entity) {
    const source = entity.source || qidFromCanonicalKey(entity.canonicalKey);
    if (entity.entityType === 'Person') {
      return throwIfError(await client.from('people').upsert({
        source: source.source,
        external_id: source.externalId,
        name: entity.name,
        description: entity.description || null,
        updated_at: new Date().toISOString()
      }).select().single(), 'mirror person');
    }
    if (entity.entityType === 'Movie') {
      return throwIfError(await client.from('movies').upsert({
        source: source.source,
        external_id: source.externalId,
        title: entity.name,
        release_year: entity.properties?.releaseYear ?? null,
        imdb_id: entity.properties?.imdbId ?? null,
        updated_at: new Date().toISOString()
      }).select().single(), 'mirror movie');
    }
    return null;
  }

  async function mirrorLegacyRelation(relation) {
    const roles = { ACTED_IN: 'cast', DIRECTED: 'director', PRODUCED: 'producer' };
    const role = roles[relation.relationType];
    if (!role) return null;

    const from = qidFromCanonicalKey(relation.fromCanonicalKey);
    const to = qidFromCanonicalKey(relation.toCanonicalKey);
    const person = throwIfError(await client.from('people').select('*').eq('source', from.source).eq('external_id', from.externalId).maybeSingle(), 'find legacy person');
    const movie = throwIfError(await client.from('movies').select('*').eq('source', to.source).eq('external_id', to.externalId).maybeSingle(), 'find legacy movie');
    if (!person || !movie) return null;

    return throwIfError(await client.from('credits').upsert({
      person_id: person.id,
      movie_id: movie.id,
      role,
      source: relation.source?.source || from.source
    }).select().single(), 'mirror legacy credit');
  }

  return {
    upsertEntity,
    upsertEntitySource,
    getEntity,
    listEntities,
    upsertRelation,
    upsertRelationSource,
    listRelations,
    listOutgoingRelations,
    getRelationSources,
    createOrResumeJob,
    updateJobCheckpoint,
    mirrorLegacyEntity,
    mirrorLegacyRelation
  };
}
