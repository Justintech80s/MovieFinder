const SEARCH_TYPES=new Set(['search_completed','search_no_results','search_failed']);
const ACCESS_TYPES=['FREE','ADS','FLATRATE','RENT','BUY'];

function round1(value){
  return Math.round((Number(value)||0)*10)/10;
}

function partsAt(date,timeZone){
  const formatter=new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn',{
    timeZone,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
  });
  const parts=Object.fromEntries(formatter.formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return {year:Number(parts.year),month:Number(parts.month),day:Number(parts.day),hour:Number(parts.hour),minute:Number(parts.minute),second:Number(parts.second)};
}

function addLocalDays(localDate,days){
  const d=new Date(Date.UTC(localDate.year,localDate.month-1,localDate.day+days));
  return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate()};
}

function localDateKey(localDate){
  return `${localDate.year}-${String(localDate.month).padStart(2,'0')}-${String(localDate.day).padStart(2,'0')}`;
}

function zonedLocalMidnightToUtc(localDate,timeZone){
  const desired=Date.UTC(localDate.year,localDate.month-1,localDate.day,0,0,0);
  let guess=desired;
  for(let i=0;i<6;i++){
    const p=partsAt(new Date(guess),timeZone);
    const represented=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
    const delta=desired-represented;
    guess+=delta;
    if(delta===0) break;
  }
  return new Date(guess);
}

export function getWeeklyWindows(now=new Date(),timeZone='America/New_York'){
  const local=partsAt(new Date(now),timeZone);
  const localDate={year:local.year,month:local.month,day:local.day};
  const weekday=new Date(Date.UTC(local.year,local.month-1,local.day)).getUTCDay();
  const daysSinceMonday=(weekday+6)%7;
  const endLocal=addLocalDays(localDate,-daysSinceMonday);
  const startLocal=addLocalDays(endLocal,-7);
  const comparisonStartLocal=addLocalDays(endLocal,-14);
  return {
    current:{
      start:zonedLocalMidnightToUtc(startLocal,timeZone),
      end:zonedLocalMidnightToUtc(endLocal,timeZone),
      startKey:localDateKey(startLocal),
      endKey:localDateKey(endLocal),
      timeZone
    },
    comparison:{
      start:zonedLocalMidnightToUtc(comparisonStartLocal,timeZone),
      end:zonedLocalMidnightToUtc(startLocal,timeZone),
      startKey:localDateKey(comparisonStartLocal),
      endKey:localDateKey(startLocal),
      timeZone
    }
  };
}

function countBy(values,selector){
  const map=new Map();
  for(const value of values){
    const selected=selector(value);
    const items=Array.isArray(selected)?selected:[selected];
    for(const item of items){
      if(item==null||item==='') continue;
      const key=String(item);
      map.set(key,(map.get(key)||0)+1);
    }
  }
  return map;
}

function topN(map,n=10){
  return [...map.entries()]
    .map(([name,count])=>({name,count}))
    .sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name))
    .slice(0,n);
}

function percent(numerator,denominator){
  return denominator?round1((numerator/denominator)*100):0;
}

function growthPct(current,previous){
  if(previous===0) return current===0?0:null;
  return round1(((current-previous)/previous)*100);
}

function searchEvents(events){
  return events.filter(event=>SEARCH_TYPES.has(event?.event_type));
}

function clickEvents(events){
  return events.filter(event=>event?.event_type==='provider_click');
}

function queryProblems(searches){
  const map=new Map();
  for(const event of searches){
    const query=event?.query_text;
    if(!query) continue;
    const row=map.get(query)||{name:query,total:0,noResults:0,failures:0};
    row.total++;
    if(event.event_type==='search_no_results') row.noResults++;
    if(event.event_type==='search_failed') row.failures++;
    map.set(query,row);
  }
  return [...map.values()]
    .map(row=>({...row,noResultRate:percent(row.noResults,row.total),failureRate:percent(row.failures,row.total)}))
    .sort((a,b)=>b.noResults-a.noResults||b.failures-a.failures||b.total-a.total||a.name.localeCompare(b.name))
    .slice(0,10);
}

function priceBands(clicks){
  const bands={under5:0,from5To9_99:0,from10To19_99:0,twentyPlus:0};
  for(const event of clicks){
    if(!['RENT','BUY'].includes(event?.monetization_type)) continue;
    const price=Number(event?.price);
    if(!Number.isFinite(price)||price<0) continue;
    if(price<5) bands.under5++;
    else if(price<10) bands.from5To9_99++;
    else if(price<20) bands.from10To19_99++;
    else bands.twentyPlus++;
  }
  return bands;
}

function baseMetrics(events){
  const searches=searchEvents(events);
  const clicks=clickEvents(events);
  const visitors=new Set(events.map(e=>e?.visitor_key).filter(Boolean));
  const sessions=new Set(events.map(e=>e?.session_key).filter(Boolean));
  const searchSessions=new Set(searches.map(e=>e?.session_key).filter(Boolean));
  const clickedSessions=new Set(clicks.map(e=>e?.session_key).filter(Boolean));
  let convertedSessions=0;
  for(const session of searchSessions) if(clickedSessions.has(session)) convertedSessions++;
  return {
    searches,
    clicks,
    visitors,
    sessions,
    searchSessions,
    convertedSessions,
    activeVisitors:visitors.size,
    sessionCount:sessions.size,
    searchCount:searches.length,
    providerClicks:clicks.length,
    noResults:searches.filter(e=>e.event_type==='search_no_results').length,
    failures:searches.filter(e=>e.event_type==='search_failed').length
  };
}

export function aggregateWeeklyReport({currentEvents=[],comparisonEvents=[],priorVisitorKeys=new Set(),window}={}){
  const current=baseMetrics(currentEvents);
  const comparison=baseMetrics(comparisonEvents);
  const returning=[...current.visitors].filter(visitor=>priorVisitorKeys?.has?.(visitor)).length;
  const accessTypeClicks=Object.fromEntries(ACCESS_TYPES.map(type=>[type,current.clicks.filter(e=>e?.monetization_type===type).length]));

  return {
    window,
    eventCount:currentEvents.length,
    activeVisitors:current.activeVisitors,
    sessions:current.sessionCount,
    searches:current.searchCount,
    returningVisitors:returning,
    returningVisitorRate:percent(returning,current.activeVisitors),
    searchesPerVisitor:current.activeVisitors?round1(current.searchCount/current.activeVisitors):0,
    noResults:current.noResults,
    noResultRate:percent(current.noResults,current.searchCount),
    failures:current.failures,
    failureRate:percent(current.failures,current.searchCount),
    providerClicks:current.providerClicks,
    searchToProviderClickRate:percent(current.convertedSessions,current.searchSessions.size),
    topQueries:topN(countBy(current.searches,e=>e.query_text)),
    topPeople:topN(countBy(current.searches,e=>e.person_name)),
    topGenres:topN(countBy(current.searches,e=>Array.isArray(e.genre_words)?e.genre_words:[])),
    topRequestedProviders:topN(countBy(current.searches,e=>e.requested_provider)),
    topClickedProviders:topN(countBy(current.clicks,e=>e.provider)),
    topClickedTitles:topN(countBy(current.clicks,e=>e.movie_title)),
    accessTypeClicks,
    priceBands:priceBands(current.clicks),
    topProblemQueries:queryProblems(current.searches),
    weekOverWeek:{
      activeVisitorsPct:growthPct(current.activeVisitors,comparison.activeVisitors),
      sessionsPct:growthPct(current.sessionCount,comparison.sessionCount),
      searchesPct:growthPct(current.searchCount,comparison.searchCount),
      providerClicksPct:growthPct(current.providerClicks,comparison.providerClicks)
    },
    comparison:{
      activeVisitors:comparison.activeVisitors,
      sessions:comparison.sessionCount,
      searches:comparison.searchCount,
      providerClicks:comparison.providerClicks,
      topGenres:topN(countBy(comparison.searches,e=>Array.isArray(e.genre_words)?e.genre_words:[]))
    }
  };
}

export function buildObservations(summary={}){
  const observations=[];
  const topProvider=summary.topClickedProviders?.[0];
  if(topProvider?.count>0) observations.push(`${topProvider.name} received the most outbound provider clicks.`);

  const topProblem=summary.topProblemQueries?.find(row=>row.noResults>0);
  if(topProblem) observations.push(`The query “${topProblem.name}” returned no useful results in ${topProblem.noResults} of ${topProblem.total} recorded searches.`);

  const previousGenres=new Map((summary.comparison?.topGenres||[]).map(row=>[row.name,row.count]));
  for(const row of summary.topGenres||[]){
    const previous=previousGenres.get(row.name)||0;
    const growth=growthPct(row.count,previous);
    if(previous>0&&growth>0){
      const label=row.name.charAt(0).toUpperCase()+row.name.slice(1);
      observations.push(`${label} searches increased ${growth}% week over week.`);
      break;
    }
  }
  return observations.slice(0,5);
}
