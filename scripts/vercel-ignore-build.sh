#!/usr/bin/env bash
set -u

# Vercel convention: exit 0 = skip this deployment, exit 1 = build it.
CANONICAL_PROJECT_ID="prj_XC7cPxwxxbcbYHUZynCkKdGNjBoL" # getmoviefinder

if [[ -n "${VERCEL_PROJECT_ID:-}" && "${VERCEL_PROJECT_ID}" != "${CANONICAL_PROJECT_ID}" ]]; then
  echo "MovieFinder: skip duplicate Vercel project ${VERCEL_PROJECT_ID}; canonical project is getmoviefinder."
  exit 0
fi

BASE="${VERCEL_GIT_PREVIOUS_SHA:-}"
HEAD="${VERCEL_GIT_COMMIT_SHA:-HEAD}"
if [[ -n "${BASE}" ]] && git cat-file -e "${BASE}^{commit}" 2>/dev/null && git cat-file -e "${HEAD}^{commit}" 2>/dev/null; then
  changed="$(git diff --name-only "${BASE}" "${HEAD}" 2>/dev/null || true)"
  if [[ -n "${changed}" ]] && ! grep -Eq '^(api/|lib/|python_search/|supabase/|package\.json$|vercel\.json$|scripts/vercel-ignore-build\.sh$)' <<<"${changed}"; then
    echo "MovieFinder: skip Vercel build because only non-runtime files changed."
    exit 0
  fi
fi

echo "MovieFinder: build canonical deployment."
exit 1
