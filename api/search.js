import { parseIntent } from '../lib/search/intent.js';
import { resolvePersonCredits } from '../lib/search/people.js';
import { normalizeOffers, filterOffers } from '../lib/search/availability.js';
import { extractCinemaConcepts } from '../lib/search/cinema-graph.js';
import { rankResults } from '../lib/search/rank.js';
import { runPersonFilmographySearch } from '../lib/search/person-search.js';
import { matchesHardConstraints } from '../lib/search/constraints.js';
import { resolveAnalyticsIdentity } from '../lib/analytics/identity.js';
import { createAnalyticsStore } from '../lib/analytics/store.js';
import { buildSearchEvent, recordEventBestEffort } from '../lib/analytics/events.js';
import { trackMovieOfferUrls } from '../lib/analytics/outbound.js';

const JW='https://apis.justwatch.com/graphql';
export const JUSTWATCH_QUERY=`query GetSuggestedTitles($country:Country!,$language:Language!,$first:Int!,$search:String!){popularTitles(country:$country,first:$first,filter:{searchQuery:$search}){edges{node{id objectType content(country:$country,language:$language){title shortDescription originalReleaseYear fullPath posterUrl genres{shortName} scoring{imdbScore imdbVotes tomatoMeter}} offers(country:$country,platform:WEB){monetizationType retailPrice(language:$language) retailPriceValue currency presentationType standardWebURL package{clearName shortName technicalName}}}}}}`;

async function jwSearch(search,first=60){
  const r=await fetch(JW,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({query:JUSTWATCH_QUERY,variables:{country:'US',language:'en',first,search}})});
  if(!r.ok) throw new Error(`availability source ${r.status}`);
  const d=await r.json();
  if(d.errors?.length) throw new Error(`availability source error: ${d.errors[0].message||'GraphQL error'}`);
  return (d.data?.popularTitles?.edges||[]).map(e=>e.node);
}

function poster(u){return u?`https://images.justwatch.com${u.replace('{profile}','s332')}`:null;}

function mapNode(n){
  const c=n.content||{};
  const checkedAt=new Date().toISOString();
  const offers=normalizeOffers((n.offers||[]).map(o=>({provider:o.package?.clearName||o.package?.shortName||o.package?.technicalName,type:o.monetizationType,price:o.retailPriceValue??o.retailPrice,currency:o.currency,quality:o.presentationType,url:o.standardWebURL})),{checkedAt,source:'JustWatch'});
  return {
    id:n.id,title:c.title,year:c.originalReleaseYear||null,mediaType:n.objectType==='SHOW'?'SHOW':'MOVIE',description:c.shortDescription||'',
    genres:(c.genres||[]).map(g=>g?.shortName).filter(Boolean),poster:poster(c.posterUrl),
    ratings:{imdb:c.scoring?.imdbScore??null,rottenTomatoes:c.scoring?.tomatoMeter??null,imdbVotes:c.scoring?.imdbVotes??null},offers,
    streamingTimeline:offers.map(o=>o.timeline).filter(Boolean),justwatchUrl:c.fullPath?`https://www.justwatch.com${c.fullPath}`:null
  };
}

function bestOffer(os=[]){
  const rank={FREE:0,ADS:1,FLATRATE:2,RENT:3,BUY:4};
  return [...os].sort((a,b)=>(rank[a.type]??9)-(rank[b.type]??9)||(a.price??999)-(b.price??999))[0]||null;
}

function catalogTitle(raw=''){
  return String(raw)
    .replace(/^(?:where can i (?:watch|find)|find me|show me|give me)\s+/i,'')
    .replace(/\s+(?:for\s+free|free|available\s+on\b.*|to\s+stream\b.*|streaming\b.*|rent(?:al|ing)?\b.*|buy\b.*|purchase\b.*)$/i,'')
    .replace(/[?.!]+$/,'')
    .trim();
}

async function availabilityForCredit(credit,intent){
  const nodes=await jwSearch(credit.title,12);
  const mapped=nodes.map(mapNode).filter(x=>x.mediaType==='MOVIE');
  const lowerTitle=String(credit.title||'').toLowerCase();
  const exact=mapped.filter(x=>x.title?.toLowerCase()===lowerTitle&&(!credit.year||!x.year||Math.abs(x.year-credit.year)<=1));
  const candidates=exact.length?exact:mapped.filter(x=>x.title?.toLowerCase()===lowerTitle);
  const movie=candidates[0];
  if(!movie) return null;
  const matching=filterOffers(movie.offers,intent);
  if(!matching.length) return null;
  return {...movie,offers:matching,streamingTimeline:matching.map(o=>o.timeline).filter(Boolean),best:bestOffer(matching),freeAvailable:matching.some(o=>['FREE','ADS'].includes(o.type)),personCredit:credit,dataConfidence:.91};
}

function availabilityFailure(error){return /^availability source\b/i.test(String(error?.message||error||''));}

export function createSearchHandler({
  analyticsStore=createAnalyticsStore(),
  analyticsSecret=process.env.ANALYTICS_ID_SECRET,
  outboundSecret=process.env.OUTBOUND_LINK_SECRET,
  now=()=>new Date(),
  logger=console
}={}){
  return async function handler(req,res){
    let q='';
    let parsed=null;
    let identity=null;

    async function record(type,resultCount=0,errorCode=null){
      if(!identity) return false;
      const event=buildSearchEvent({type,query:q,parsed:parsed||{},resultCount,errorCode,identity,occurredAt:now()});
      return recordEventBestEffort({store:analyticsStore,event,logger});
    }

    function trackedResults(results){
      if(!outboundSecret) return results;
      const linkNow=now().getTime();
      return results.map(movie=>trackMovieOfferUrls(movie,outboundSecret,{nowMs:linkNow}));
    }

    try{
      q=String(req.query?.q||'').trim();
      if(!q) return res.status(400).json({error:'Missing q'});
      identity=resolveAnalyticsIdentity(req,res,{secret:analyticsSecret});
      parsed=parseIntent(q);
      parsed.concepts=extractCinemaConcepts(q);

      if(parsed.kind==='person-filmography'){
        const personSearch=await runPersonFilmographySearch(parsed,{resolveCredits:resolvePersonCredits,lookupAvailability:credit=>availabilityForCredit(credit,parsed),rank:rankResults,availabilityLimit:60,concurrency:6});
        if(!personSearch.person){
          await record('search_no_results',0);
          return res.status(200).json({parsed,filmography:[],results:[],availabilitySummary:personSearch.availabilitySummary,liveAt:new Date().toISOString(),dataQuality:{confidence:.2}});
        }
        const resultCount=personSearch.results.length;
        await record(resultCount?'search_completed':'search_no_results',resultCount);
        return res.status(200).json({parsed:{...parsed,person:personSearch.person},filmography:personSearch.filmography,results:trackedResults(personSearch.results),availabilitySummary:personSearch.availabilitySummary,liveAt:new Date().toISOString(),dataQuality:{confidence:personSearch.results.length?.9:.62,filmographySource:'Wikidata',availabilitySource:'current U.S. availability feed'}});
      }

      const title=catalogTitle(q);
      parsed.titleQuery=title||null;
      const nodes=await jwSearch(title||q,80);
      let results=nodes.map(mapNode);
      if(parsed.provider||parsed.freeOnly||parsed.rentOnly||parsed.buyOnly){
        results=results.map(movie=>{
          const offers=filterOffers(movie.offers,parsed);
          return {...movie,offers,streamingTimeline:offers.map(o=>o.timeline).filter(Boolean),best:bestOffer(offers),freeAvailable:offers.some(o=>['FREE','ADS'].includes(o.type))};
        }).filter(movie=>movie.offers.length);
      } else results=results.map(movie=>({...movie,best:bestOffer(movie.offers),freeAvailable:movie.offers.some(o=>['FREE','ADS'].includes(o.type))}));
      results=results.filter(movie=>matchesHardConstraints(movie,parsed));
      results=rankResults(results,parsed).slice(0,40);
      await record(results.length?'search_completed':'search_no_results',results.length);
      return res.status(200).json({parsed,results:trackedResults(results),liveAt:new Date().toISOString()});
    }catch(error){
      const availabilityDown=availabilityFailure(error);
      await record('search_failed',0,availabilityDown?'availability_unavailable':'search_internal_error');
      if(availabilityDown) return res.status(503).json({error:'Streaming availability temporarily unavailable',code:'AVAILABILITY_UNAVAILABLE',detail:String(error?.message||error)});
      return res.status(500).json({error:'MovieFinder search failed',detail:String(error?.message||error)});
    }
  };
}

export default createSearchHandler();
