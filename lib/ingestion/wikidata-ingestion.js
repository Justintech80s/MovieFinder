const QID = /^Q\d+$/;

function relationQids(normalized) {
  const result = [];
  for (const relation of normalized?.relations || []) {
    for (const key of [relation.fromCanonicalKey, relation.toCanonicalKey]) {
      const [source, externalId] = String(key || '').split(':', 2);
      if (source === 'wikidata' && QID.test(String(externalId || ''))) result.push(externalId);
    }
  }
  return [...new Set(result)];
}

function relationSourceId(relation) {
  return `${relation.source?.externalId || 'unknown'}:${relation.relationType}:${relation.fromCanonicalKey}:${relation.toCanonicalKey}`;
}

export function createWikidataIngestionService({ client, normalizer, repository, now = () => new Date() } = {}) {
  if (!client?.fetchEntities) throw new TypeError('wikidata ingestion requires client');
  if (typeof normalizer !== 'function') throw new TypeError('wikidata ingestion requires normalizer');
  if (!repository?.createOrResumeJob) throw new TypeError('wikidata ingestion requires repository');

  async function persistBatch(rawEntities, retrievedAt, stats, storedEntityKeys) {
    const normalized = normalizer({ entities: rawEntities, retrievedAt });
    const availableKeys = new Set(normalized.entities.map(entity => entity.canonicalKey));
    const missingQids = [];

    for (const relation of normalized.relations) {
      for (const key of [relation.fromCanonicalKey, relation.toCanonicalKey]) {
        if (availableKeys.has(key)) continue;
        const [source, qid] = String(key || '').split(':', 2);
        if (source === 'wikidata' && QID.test(String(qid || '')) && !missingQids.includes(qid)) missingQids.push(qid);
      }
    }

    for (let index = 0; index < missingQids.length; index += 50) {
      const chunk = missingQids.slice(index, index + 50);
      const { entities } = await client.fetchEntities(chunk);
      const linked = normalizer({ entities, retrievedAt });
      for (const entity of linked.entities) {
        if (!availableKeys.has(entity.canonicalKey)) {
          normalized.entities.push(entity);
          availableKeys.add(entity.canonicalKey);
        }
      }
    }

    for (const entity of normalized.entities) {
      const saved = await repository.upsertEntity(entity);
      await repository.upsertEntitySource(saved.id, entity.source);
      await repository.mirrorLegacyEntity(entity);
      if (!storedEntityKeys.has(entity.canonicalKey)) {
        storedEntityKeys.add(entity.canonicalKey);
        stats.entitiesStored += 1;
      }
    }

    for (const relation of normalized.relations) {
      if (!availableKeys.has(relation.fromCanonicalKey) || !availableKeys.has(relation.toCanonicalKey)) {
        stats.relationsSkipped += 1;
        continue;
      }
      const saved = await repository.upsertRelation(relation);
      await repository.upsertRelationSource(saved.id, {
        ...relation.source,
        externalId: relationSourceId(relation)
      });
      await repository.mirrorLegacyRelation(relation);
      stats.relationsStored += 1;
    }

    stats.skipped += normalized.skipped || 0;
    return normalized;
  }

  async function ingestWikidataSeed(qid, { maxLinkedEntities = 50, batchSize = 20 } = {}) {
    if (!QID.test(String(qid || ''))) throw new TypeError(`invalid Wikidata QID: ${qid}`);
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50) throw new RangeError('batchSize must be between 1 and 50');
    if (!Number.isInteger(maxLinkedEntities) || maxLinkedEntities < 0) throw new RangeError('maxLinkedEntities must be non-negative');

    const job = await repository.createOrResumeJob({ source: 'wikidata', jobType: 'seed', seedExternalId: qid });
    const processed = new Set(job.checkpoint?.processedQids || []);
    const storedEntityKeys = new Set(job.checkpoint?.storedEntityKeys || []);
    const resumedPending = (job.checkpoint?.pendingQids || []).filter(id => QID.test(String(id)) && !processed.has(id));
    const queue = resumedPending.length ? [...new Set(resumedPending)] : (processed.has(qid) ? [] : [qid]);
    const discovered = new Set([...processed, ...queue]);
    const stats = {
      entitiesStored: job.stats?.entitiesStored || 0,
      relationsStored: job.stats?.relationsStored || 0,
      relationsSkipped: job.stats?.relationsSkipped || 0,
      skipped: job.stats?.skipped || 0
    };
    let activeBatch = [];

    const checkpoint = ({ includeActiveBatch = false } = {}) => ({
      processedQids: [...processed],
      pendingQids: [...new Set([
        ...(includeActiveBatch ? activeBatch : []),
        ...queue
      ].filter(id => !processed.has(id)))],
      storedEntityKeys: [...storedEntityKeys]
    });

    try {
      while (queue.length) {
        activeBatch = queue.splice(0, Math.min(batchSize, 50)).filter(id => !processed.has(id));
        if (!activeBatch.length) continue;

        const { entities } = await client.fetchEntities(activeBatch);
        const retrievedAt = now().toISOString();
        const normalized = await persistBatch(entities, retrievedAt, stats, storedEntityKeys);

        for (const id of activeBatch) processed.add(id);
        for (const linked of relationQids(normalized)) {
          if (processed.has(linked) || discovered.has(linked)) continue;
          if (discovered.size - processed.size >= maxLinkedEntities) break;
          discovered.add(linked);
          queue.push(linked);
        }

        activeBatch = [];
        await repository.updateJobCheckpoint(job.id, {
          status: 'running',
          checkpoint: checkpoint(),
          stats
        });
      }

      return await repository.updateJobCheckpoint(job.id, {
        status: 'completed',
        checkpoint: checkpoint(),
        stats,
        error: null
      });
    } catch (error) {
      try {
        await repository.updateJobCheckpoint(job.id, {
          status: 'failed',
          checkpoint: checkpoint({ includeActiveBatch: true }),
          stats,
          error: error?.message || String(error)
        });
      } catch {
        // Checkpoint persistence is best-effort here; preserve the ingestion failure as the primary error.
      }
      throw error;
    }
  }

  return { ingestWikidataSeed };
}
