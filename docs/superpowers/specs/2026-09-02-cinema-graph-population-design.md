# Cinema Graph Population Design

## Goal

Turn trustworthy movie/person metadata already available to MovieFinder into typed, deduplicated Cinema Graph nodes and evidence-backed relationships that later search, RAG, ranking, and AI-verification layers can consume.

## Architecture

The population layer is deterministic. A metadata normalizer accepts movie-shaped records and extracts only explicit source fields. A graph builder then upserts typed nodes and edges into the existing in-process Cinema Graph store. It does not infer missing actors, directors, countries, themes, styles, or influences.

Data flow:

`movie/person metadata -> normalize/validate -> Cinema Graph builder -> typed nodes + provenance/confidence edges -> existing Cinema Graph store`

## Metadata Contract

The builder accepts a movie object with any supported explicit fields:

- `id`, `title`, `year`
- `actors` or `cast`: strings or person objects with `id`/`name`
- `directors` or `director`: strings or person objects
- `writers` or `writer`: strings or person objects
- `genres`: strings
- `countries` or `country`: strings
- `themes`: strings
- `styles`: strings
- `movements`: strings
- `influences`: explicit movie/person references only
- optional `source`/`provenance` and `confidence`

Malformed, empty, or unsupported values are ignored rather than guessed.

## Stable Identity

Prefer explicit upstream IDs. When unavailable, generate deterministic IDs from normalized type + label, with movie year included where useful. Re-ingesting the same metadata must update/upsert rather than multiply nodes.

## Relationships

Populate only explicit relationships supported by the current typed graph:

- person -> movie `STARS`
- movie -> person `DIRECTED_BY`
- movie -> person `WRITTEN_BY`
- movie -> genre `HAS_GENRE`
- movie -> theme `HAS_THEME`
- movie -> era `FROM_ERA`
- movie -> country `FROM_COUNTRY`
- movie -> style `HAS_STYLE`
- movie -> movement `PART_OF_MOVEMENT`
- movie -> explicit influence `INFLUENCED_BY`

Every generated edge carries bounded confidence and provenance. Defaults are conservative deterministic metadata provenance, not model-generated authority.

## Era Derivation

Era is the only derived categorical relationship in v1 because it is mechanically determined by a valid numeric release year. A movie from 1974 receives an era node representing `1970s`. No subjective historical movement is inferred from year.

## Compatibility

Existing `extractCinemaConcepts()` and `scoreCinemaRelations()` remain unchanged. The new builder is exported through `lib/search/cinema-graph.js` so callers do not depend on internal folder paths.

## Error Handling

- Missing movie title: do not ingest a movie node.
- Invalid year: omit `FROM_ERA`.
- Empty arrays/strings: ignore.
- Duplicate cast/genres/etc.: graph/store deduplication prevents duplicate relationships.
- Unknown fields: ignore.
- Confidence values are clamped by the existing graph normalization layer.

## Testing

Tests must prove:

1. movie, actor, director, writer, genre, country, theme, style, movement, and era nodes are created from explicit metadata;
2. relationship directions/types are correct;
3. repeated ingestion is idempotent;
4. malformed metadata is ignored safely;
5. explicit provenance/confidence reaches edges;
6. no unsupported relationship is invented when metadata is absent;
7. existing Cinema Graph tests continue to pass.

## Deferred

- External graph database/Neo4j
- automatic theme/style/influence inference
- large batch ingestion jobs
- persistent graph storage
- embedding generation
- external metadata crawling

These belong to later steps after the deterministic graph population contract is proven.