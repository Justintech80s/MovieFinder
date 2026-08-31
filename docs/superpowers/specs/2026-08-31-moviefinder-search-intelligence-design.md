# MovieFinder Search Intelligence Design

## Goal
Upgrade MovieFinder so natural-language searches understand people, directors, actors, genres, film movements, reference movies, and streaming intent before falling back to literal title/franchise matching.

## Baseline constraint
The current GitHub repository is empty while the live Vercel project already exists. The live production source must be recovered or exported before production code is replaced. Do not reconstruct the visible production application from memory. Preserve the current MovieFinder UI, branding, support screen, support destinations, keyboard behavior, and existing working title search.

## Architecture
The backend search path becomes:

User query -> intent/entity parser -> person/title/concept resolution -> catalog/filmography retrieval -> Cinema Graph scoring -> current availability lookup -> confidence/verification -> hybrid ranking -> response formatter.

Person/director recognition runs before generic title/franchise extraction. A query such as `all Quentin Tarantino movies to stream` resolves Quentin Tarantino as a person, selects directing credits, then checks each film against current U.S. availability. Actor/actress queries use the same person pipeline with acting credits.

## Components

### Intent and entity parser
Recognizes title, person, role, genre/subgenre, era/year/decade, provider, free/subscription/rent/buy intent, rating/runtime/price constraints, reference films, and style concepts. It must not treat the full natural-language sentence as a title when a high-confidence person intent exists.

### Person resolver
Provides a provider-independent interface for resolving a person and retrieving credits. Initial no-key fallback may use Wikidata/public structured data. A licensed film/people source can replace it later without changing the parser interface.

### Availability adapter
Keeps the existing working availability source behind a normalized interface. Provider names are normalized dynamically from returned offers rather than relying solely on a fixed allow-list. Availability is treated as fresh data and must not be inferred from film metadata.

### Cinema Graph
Scores relationships among title, director, cast, genres/subgenres, era, country, themes, style, influences, reference films, and related cinema concepts. It augments retrieval/ranking; it does not override hard constraints such as provider, price, free-only, year, or media type.

### Hybrid ranker
Combines exact/entity match, semantic/concept match, Cinema Graph relationship strength, hard-constraint satisfaction, popularity/rating signals when legally available, availability, freshness, and feedback. Exact person/title intent and hard constraints have priority over soft similarity.

### Confidence and verification
Every result receives confidence. Ambiguous or low-confidence entity matches are routed to verification rather than confidently returning unrelated titles. Changing streaming/rental/purchase claims must come from the current availability source or another current reliable source.

## Deployment strategy
1. Recover/export the exact current production source before replacing production code.
2. Commit the recovered baseline to GitHub without intentionally changing visible behavior.
3. Create a feature branch for search-intelligence changes.
4. Add tests before each behavior change.
5. Deploy a Vercel preview from the feature branch.
6. Verify existing title searches plus director, actor, concept, provider, free, rental, and purchase searches.
7. Merge/promote only after preview passes.

## Required acceptance searches
- `Where can I find all of Quentin Tarantino movies to stream?`
- `Martin Scorsese movies streaming`
- `films directed by Christopher Nolan`
- `Spike Lee films available to stream`
- `All Denzel Washington films available on streaming`
- `All Will Smith movies available on streaming`
- `Find me a grimy 1970s revenge thriller like Rolling Thunder`
- `Find me a giallo movie`
- `Find me a spaghetti western`
- `Find me a scary movie with a Rotten Tomatoes score of 90% or higher`
- `Where can I watch The Godfather?`
- `Where can I watch the Star Wars movie for free?`

## Safety and data constraints
Do not scrape Rotten Tomatoes, IMDb, streaming services, or other sites in violation of their terms. Do not commit API keys, passwords, tokens, private credentials, or payment secrets. Existing support/payment destinations must not be altered as part of this search upgrade. Do not claim a production change is live until the live endpoint has been tested after deployment.
