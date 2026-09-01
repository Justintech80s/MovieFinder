# MovieFinder Python Search Backend Spec

## Goal

Strengthen MovieFinder's search intelligence with Python-compatible backend components while preserving the current visual app exactly as it is and preserving the existing `/api/search` response contract.

## Approved UX constraint

The visible MovieFinder app must not be redesigned. Existing layout, colors, typography, search field, cards, navigation, support/payment destinations, and user workflow remain unchanged.

## Search behavior

1. Generic person queries such as `Quentin Tarantino movies`, `Quentin Tarantino streaming movies`, `all Will Smith movies available on streaming`, and `Denzel Washington filmography` search all relevant movie credits.
2. Relevant person credit roles are actor/cast, director, producer, and writer/screenplay.
3. Explicit role queries remain role-specific, such as `movies directed by Christopher Nolan` or `movies produced by ...`.
4. The complete person filmography is assembled before availability is checked.
5. The same movie appearing under multiple roles is returned once, with an aggregated `roles` array and a compatibility `role` field.
6. Availability lookup runs once per unique movie after aggregation.
7. IMDb/popularity ranking must never decide which titles belong in a person's filmography.
8. Existing catalog constraints for genre, year, Rotten Tomatoes threshold, provider, free, rent, and buy continue to be applied as hard constraints before ranking.
9. Existing title searches such as `The Godfather` and `Star Wars free` must remain compatible.

## Architecture

MovieFinder keeps the current Vercel frontend and `/api/search` API boundary. Python logic is introduced as a focused search-intelligence module/service rather than a frontend rewrite. The initial implementation must prioritize the smallest production-safe integration path: first make the runtime behavior correct through the existing API contract, then add Python components behind that contract where they can be deployed reliably without changing the UI.

Because JavaScript and Python cannot be imported directly into one another inside a single serverless function, Python integration must use a clean HTTP/service boundary if enabled in production. Until that service boundary is deployed and verified, the existing JavaScript API route remains the compatibility adapter and source of truth for the frontend.

## Python component responsibilities

- `intent_parser.py`: normalized person/role/availability intent structures where Python owns intent processing.
- `filmography.py`: merge and deduplicate person credits by stable work ID, falling back to normalized title + year.
- `roles.py`: deterministic role normalization and display ordering.
- `availability.py`: enrich already-assembled unique films with current availability data.
- `models.py`: typed request/result models matching the existing frontend contract.
- `app.py`: FastAPI HTTP boundary when the Python service is deployed.

## Compatibility contract

The frontend continues receiving the existing fields used today, including `parsed`, `filmography`, `results`, `availabilitySummary`, `liveAt`, and `dataQuality` for person searches, and the current catalog result fields for normal title/genre searches.

Each aggregated filmography item may add `roles`, but existing fields must not be removed. If multiple roles exist, `role` remains populated with a deterministic primary role for backward compatibility.

## Safety and release rules

- Test-first development is required.
- Do not change production until the feature branch passes CI and preview acceptance.
- Do not remove existing working JavaScript behavior merely to increase Python usage.
- Do not deploy a Python service URL that is not health-checked and covered by contract tests.
- If the Python service is unavailable, the frontend must not silently return unrelated popularity-ranked catalog results for a person query.
- No UI redesign is part of this work.
