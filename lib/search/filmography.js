function fallbackId(credit={}) {
  if (credit.workId) return credit.workId;
  const title=String(credit.title||'unknown').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  return `credit:${title}:${credit.year||'unknown'}:${credit.role||'unknown'}`;
}

export function buildFilmographyRecord(credit={}, availabilityResult=null) {
  const availabilityError=availabilityResult?.error ? String(availabilityResult.error) : null;
  const movie=!availabilityError && availabilityResult ? (availabilityResult.movie || availabilityResult) : null;
  const offers=Array.isArray(movie?.offers) ? movie.offers : [];
  const streamingTimeline=Array.isArray(movie?.streamingTimeline)
    ? movie.streamingTimeline
    : offers.map(o=>o?.timeline).filter(Boolean);
  const availabilityStatus=availabilityError ? 'UNKNOWN' : offers.length ? 'NOW' : 'UNAVAILABLE';

  return {
    id:movie?.id || fallbackId(credit),
    workId:credit.workId || null,
    title:movie?.title || credit.title || 'Unknown title',
    year:movie?.year ?? credit.year ?? null,
    mediaType:movie?.mediaType || 'MOVIE',
    description:movie?.description || '',
    poster:movie?.poster || null,
    ratings:movie?.ratings || { imdb:null, rottenTomatoes:null, imdbVotes:null },
    offers,
    best:movie?.best || null,
    freeAvailable:movie?.freeAvailable ?? offers.some(o=>['FREE','ADS'].includes(o.type)),
    justwatchUrl:movie?.justwatchUrl || null,
    personCredit:credit,
    availabilityStatus,
    streamingTimeline,
    availabilityError
  };
}

export function partitionFilmography(records=[], intent={}) {
  const filmography=[...(records||[])];
  const availabilitySummary={
    total:filmography.length,
    availableNow:filmography.filter(r=>r.availabilityStatus==='NOW').length,
    unavailable:filmography.filter(r=>r.availabilityStatus==='UNAVAILABLE').length,
    unknown:filmography.filter(r=>r.availabilityStatus==='UNKNOWN').length
  };
  const results=intent.filmographyView==='available'
    ? filmography.filter(r=>r.availabilityStatus==='NOW')
    : filmography;
  return { filmography, results, availabilitySummary };
}
