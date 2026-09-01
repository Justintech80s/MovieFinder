import { sanitizeQuery } from './privacy.js';

const SEARCH_TYPES=new Set(['search_completed','search_no_results','search_failed']);
const ERROR_CODES=new Set(['availability_unavailable','search_internal_error']);
const ACCESS_TYPES=new Set(['FREE','ADS','FLATRATE','RENT','BUY']);

function iso(value){
  return value instanceof Date?value.toISOString():new Date(value).toISOString();
}

export function buildSearchEvent({type,query,parsed={},resultCount=0,errorCode=null,identity,occurredAt=new Date()}={}){
  if(!identity?.visitorKey||!identity?.sessionKey) return null;
  if(!SEARCH_TYPES.has(type)) throw new Error('unsupported analytics search event');
  return {
    occurred_at:iso(occurredAt),
    event_type:type,
    visitor_key:identity.visitorKey,
    session_key:identity.sessionKey,
    query_text:sanitizeQuery(query),
    result_count:Number.isFinite(Number(resultCount))?Math.max(0,Number(resultCount)):0,
    error_code:type==='search_failed'?(ERROR_CODES.has(errorCode)?errorCode:'search_internal_error'):null,
    genre_words:Array.isArray(parsed.genreWords)?parsed.genreWords.map(String).slice(0,12):[],
    person_name:parsed.personName?String(parsed.personName).slice(0,120):null,
    person_role:parsed.role?String(parsed.role).slice(0,40):null,
    requested_provider:parsed.provider?String(parsed.provider).slice(0,120):null,
    year_min:Number.isInteger(parsed.yearMin)?parsed.yearMin:null,
    year_max:Number.isInteger(parsed.yearMax)?parsed.yearMax:null
  };
}

export function buildProviderClickEvent({identity,occurredAt=new Date(),movieId=null,movieTitle=null,movieYear=null,provider=null,monetizationType=null,price=null}={}){
  if(!identity?.visitorKey||!identity?.sessionKey) return null;
  const numericPrice=price==null?null:Number(price);
  return {
    occurred_at:iso(occurredAt),
    event_type:'provider_click',
    visitor_key:identity.visitorKey,
    session_key:identity.sessionKey,
    movie_id:movieId?String(movieId).slice(0,160):null,
    movie_title:movieTitle?String(movieTitle).slice(0,240):null,
    movie_year:Number.isInteger(Number(movieYear))?Number(movieYear):null,
    provider:provider?String(provider).slice(0,160):null,
    monetization_type:ACCESS_TYPES.has(monetizationType)?monetizationType:null,
    price:Number.isFinite(numericPrice)?numericPrice:null
  };
}

export async function recordEventBestEffort({store,event,logger=console}={}){
  if(!store||!event) return false;
  try{
    return Boolean(await store.insertEvent(event));
  }catch(error){
    logger?.warn?.('MovieFinder analytics write failed',error?.message||String(error));
    return false;
  }
}
