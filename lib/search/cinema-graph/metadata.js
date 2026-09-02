const clean=s=>String(s??'').trim().replace(/\s+/g,' ');
const slug=s=>clean(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const array=v=>v==null?[]:Array.isArray(v)?v:[v];
const unique=(items,key=x=>x.id)=>[...new Map(items.filter(Boolean).map(x=>[key(x),x])).values()];
const validYear=y=>{const n=Number(y);return Number.isInteger(n)&&n>=1880&&n<=2200?n:null;};
const confidence=v=>Math.max(0,Math.min(1,Number.isFinite(Number(v))?Number(v):.9));
function entity(value,type,extra={}){
 if(value==null)return null;
 const obj=typeof value==='object'?value:{name:value};
 const label=clean(obj.name??obj.label??obj.title);
 if(!label)return null;
 return {id:clean(obj.id)||`${type}:${slug(label)}`,type,label,...extra};
}
function categorical(values,type){return unique(array(values).map(v=>entity(v,type)));}
function people(values,role){return array(values).map(v=>entity(v,'person',{role})).filter(Boolean);}
export function normalizeMovieMetadata(movie={},defaults={}){
 const title=clean(movie.title??movie.name);
 if(!title)return null;
 const year=validYear(movie.year??movie.releaseYear);
 const movieId=clean(movie.id)||`movie:${slug(title)}${year?`-${year}`:''}`;
 const allPeople=unique([
  ...people(movie.actors??movie.cast,'actor'),
  ...people(movie.directors??movie.director,'director'),
  ...people(movie.writers??movie.writer,'writer')
 ],x=>`${x.role}:${x.id}`);
 const provenance=clean(movie.provenance??movie.source??defaults.provenance)||'metadata';
 const conf=confidence(movie.confidence??defaults.confidence);
 return {
  movie:{id:movieId,type:'movie',label:title,metadata:{...(year?{year}:{})}},
  people:allPeople,
  genres:categorical(movie.genres,'genre'),
  countries:categorical(movie.countries??movie.country,'country'),
  themes:categorical(movie.themes,'theme'),
  styles:categorical(movie.styles,'style'),
  movements:categorical(movie.movements,'movement'),
  influences:array(movie.influences).map(v=>entity(v,(typeof v==='object'&&v.type)||'movie')).filter(Boolean),
  era:year?{id:`era:${Math.floor(year/10)*10}s`,type:'era',label:`${Math.floor(year/10)*10}s`}:null,
  provenance,confidence:conf
 };
}
