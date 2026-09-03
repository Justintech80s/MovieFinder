import { createHash } from 'node:crypto';

function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeWhitespace)
    .filter(Boolean);
}

function normalizeSources(sources) {
  if (!Array.isArray(sources)) return [];
  return sources
    .filter(source => source && typeof source === 'object')
    .map(source => ({
      kind: normalizeWhitespace(source.kind || source.sourceKind || 'unknown'),
      ref: normalizeWhitespace(source.ref || source.sourceRef || ''),
      url: normalizeWhitespace(source.url || source.sourceUrl || '')
    }))
    .filter(source => source.kind || source.ref || source.url);
}

function firstSourceRef(provenance) {
  return provenance.find(source => source.ref)?.ref || '';
}

export function hashSemanticContent({ documentType, entityId, content, sourceRef } = {}) {
  const canonical = [
    normalizeWhitespace(documentType),
    normalizeWhitespace(entityId),
    normalizeWhitespace(content),
    normalizeWhitespace(sourceRef)
  ].join('\n');

  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function createDocument({ entity, documentType, content, provenance }) {
  const normalizedContent = normalizeWhitespace(content);
  if (!normalizedContent) return null;

  const entityId = normalizeWhitespace(entity?.id);
  const title = normalizeWhitespace(entity?.label || entity?.title || entity?.name);
  const sourceRef = firstSourceRef(provenance);

  return {
    entityId,
    documentType,
    title,
    content: normalizedContent,
    contentHash: hashSemanticContent({
      documentType,
      entityId,
      content: normalizedContent,
      sourceRef
    }),
    sourceKind: provenance[0]?.kind || 'unknown',
    sourceRef,
    sourceUrl: provenance[0]?.url || '',
    provenance,
    language: 'en',
    metadata: {}
  };
}

export function buildSemanticDocuments({ entity, relations = [], sources = [] } = {}) {
  if (!entity || typeof entity !== 'object') return [];

  const type = normalizeWhitespace(entity.type).toLowerCase();
  const properties = entity.properties && typeof entity.properties === 'object'
    ? entity.properties
    : {};
  const provenance = normalizeSources(sources);
  const documents = [];

  if (type === 'movie') {
    const summary = normalizeWhitespace(properties.summary || properties.description || '');
    const themes = normalizeStringList(properties.themes);
    const style = normalizeStringList(properties.style || properties.styles);

    const summaryDocument = createDocument({
      entity,
      documentType: 'movie_summary',
      content: summary,
      provenance
    });
    if (summaryDocument) documents.push(summaryDocument);

    const themesDocument = createDocument({
      entity,
      documentType: 'movie_themes',
      content: themes.join(', '),
      provenance
    });
    if (themesDocument) documents.push(themesDocument);

    const styleDocument = createDocument({
      entity,
      documentType: 'movie_style',
      content: style.join(', '),
      provenance
    });
    if (styleDocument) documents.push(styleDocument);
  }

  void relations;
  return documents;
}
