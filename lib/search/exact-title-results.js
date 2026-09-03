const normalizeTitle = value => String(value ?? '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const BROAD_DISCOVERY_LANGUAGE = /\b(movies|films|recommend|recommendations)\b|\b(?:similar to|something like)\b/i;

export function shouldUseExactTitleMode({ query = '', titleQuery = '', parsedIntent = {} } = {}) {
  const title = normalizeTitle(titleQuery);
  if (!title) return false;
  if (parsedIntent?.kind === 'person-filmography') return false;
  if (parsedIntent?.similarityTitle) return false;
  if (Array.isArray(parsedIntent?.genreWords) && parsedIntent.genreWords.length) return false;
  if (parsedIntent?.rtMin != null) return false;

  const raw = String(query || '').trim();
  if (!raw) return false;
  if (BROAD_DISCOVERY_LANGUAGE.test(raw)) return false;

  return true;
}

export function selectExactTitleResults(results = [], { titleQuery = '', yearMin = null, yearMax = null } = {}) {
  const target = normalizeTitle(titleQuery);
  if (!target) return [];

  const exactYear = yearMin != null && yearMax != null && Number(yearMin) === Number(yearMax)
    ? Number(yearMin)
    : null;

  const matches = (Array.isArray(results) ? results : []).filter(movie => {
    if (normalizeTitle(movie?.title ?? movie?.name) !== target) return false;
    if (exactYear == null) return true;
    return movie?.year != null && Number(movie.year) === exactYear;
  });

  const movieMatches = matches.filter(movie => String(movie?.mediaType ?? movie?.type ?? '').toUpperCase() === 'MOVIE');
  return (movieMatches.length ? movieMatches : matches).slice(0, 1);
}
