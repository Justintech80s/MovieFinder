const norm=value=>String(value??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const genreNorm=value=>{
  const n=norm(value);
  if(['sci fi','science fiction'].includes(n)) return 'sci fi';
  if(n==='animated') return 'animation';
  if(n==='gangster') return 'crime';
  return n;
};

function offerMatches(offer,intent){
  if(intent.provider&&!norm(offer?.provider).includes(norm(intent.provider))) return false;
  if(intent.freeOnly&&!['FREE','ADS'].includes(offer?.type)) return false;
  if(intent.rentOnly&&offer?.type!=='RENT') return false;
  if(intent.buyOnly&&offer?.type!=='BUY') return false;
  return true;
}

export function matchesHardConstraints(movie={},intent={}){
  if(intent.mediaType&&String(movie.mediaType||'').toUpperCase()!==String(intent.mediaType).toUpperCase()) return false;
  if(intent.yearMin!=null&&(movie.year==null||Number(movie.year)<Number(intent.yearMin))) return false;
  if(intent.yearMax!=null&&(movie.year==null||Number(movie.year)>Number(intent.yearMax))) return false;

  if(intent.rtMin!=null){
    const score=movie.ratings?.rottenTomatoes;
    if(score==null||Number(score)<Number(intent.rtMin)) return false;
  }

  if(intent.genreWords?.length){
    const movieGenres=new Set((movie.genres||[]).map(genreNorm));
    if(!intent.genreWords.every(genre=>movieGenres.has(genreNorm(genre)))) return false;
  }

  if(intent.provider||intent.freeOnly||intent.rentOnly||intent.buyOnly){
    if(!(movie.offers||[]).some(offer=>offerMatches(offer,intent))) return false;
  }

  return true;
}
