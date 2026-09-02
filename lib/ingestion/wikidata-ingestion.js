const QID = /^Q\d+$/;

function linkedQids(entity) {
  const result = [];
  for (const claims of Object.values(entity?.claims || {})) {
    for (const claim of claims || []) {
      const id = claim?.mainsnak?.datavalue?.value?.id;
      if (QID.test(String(id || ''))) result.push(id);
    }
  }
  return [...new Set(result)];
}

function chunks(values, size) {
  const output = [];
  for (let i = 0; i < values.length; i += size) output.push(values.slice(i, i + size));
  return output;
}

function relationSourceId(relation) {
  return `${relation.source?.externalId || 'unknown'}:${relation.relationType}:${relation.fromCanonicalKey}:${relation.toCanonicalKey}`;
}

export function createWikidataIngestionService({ client, normalizer, repository, now = () => new Date() } = {}) {
  if (!client?.fetchEntities) throw new TypeError('wikidata ingestion requires client');
  if (typeof normalizer !== 'function') throw new TypeError('wikidata ingestion requires normalizer');
  if (!repository?.createOrResumeJob) throw new TypeError('wikidata ingestion requires repository');

  async function persistBatch(rawEntities, retrievedAt, stats) {
    const normalized = normalizer({ entities: rawEntities, retrievedAt });
    const availableKeys = new Set(normalized.entities.map(entity => entity.canonicalKey));

    for (const relation of normalized.relations) {
      for (const key of [relation.fromCanonicalKey, relation.toCanonicalKey]) {
        if (availableKeys.has(key)) continue;
        const qid = key.split(':')[1];
        if (!qid) continue;
        const { entities } = await client.fetchEntities([qid]);
        const linked = normalizer({ entities, retrievedAt });
        for (const entity of linked.entities) {
          if (!availableKeys.has(entity.canonicalKey)) {
            normalized.entities.push(entity);
            availableKeys.add(entity.canonicalKey);
          }
        }
      }
    }

    for (const entity of normalized.entities) {
      const saved = await repository.upsertEntity(entity);
      await repository.upsertEntitySource(saved.id, entity.source);
      await repository.mirrorLegacyEntity(entity);
      stats.entitiesStored += 1;
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
    const stats = {
      entitiesStored: job.stats?.entitiesStored || 0,
      relationsStored: job.stats?.relationsStored || 0,
      relationsSkipped: job.stats?.relationsSkipped || 0,
      skipped: job.stats?.skipped || 0
    };

    try {
      const queue = processed.has(qid) ? [] : [qid];
      const discovered = new Set(queue);

      while (queue.length) {
        const batch = queue.splice(0, Math.min(batchSize, 50)).filter(id => !processed.has(id));
        if (!batch.length) continue;

        const { entities } = await client.fetchEntities(batch);
        const retrievedAt = now().toISOString();
        await persistBatch(entities, retrievedAt, stats);

        for (const id of batch) processed.add(id);
        for (const entity of Object.values(entities)) {
          for (const linked of linkedQids(entity)) {
            if (processed.has(linked) || discovered.has(linked)) continue;
            if (discovered.size - 1 >= maxLinkedEntities) break;
            discovered.add(linked);
            queue.push(linked);
          }
        }

        await repository.updateJobCheckpoint(job.id, {
          status: 'running',
          checkpoint: { processedQids: [...processed] },
          stats
        });
      }

      return await repository.updateJobCheckpoint(job.id, {
        status: 'completed',
        checkpoint: { processedQids: [...processed] },
        stats,
        error: null
      });
    } catch (error) {
      await repository.updateJobCheckpoint(job.id, {
        status: 'failed',
        checkpoint: { processedQids: [...processed] },
        stats,
        error: error?.message || String(error)
      });
      throw error;
    }
  }

  return { ingestWikidataSeed };
}
