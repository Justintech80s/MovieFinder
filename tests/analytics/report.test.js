import test from 'node:test';
import assert from 'node:assert/strict';
import { getWeeklyWindows, aggregateWeeklyReport, buildObservations } from '../../lib/analytics/report.js';

test('weekly windows use New York Monday midnights across EDT and EST', () => {
  const summer=getWeeklyWindows(new Date('2026-09-07T12:00:00Z'));
  assert.equal(summer.current.start.toISOString(),'2026-08-31T04:00:00.000Z');
  assert.equal(summer.current.end.toISOString(),'2026-09-07T04:00:00.000Z');
  const winter=getWeeklyWindows(new Date('2026-12-07T13:00:00Z'));
  assert.equal(winter.current.start.toISOString(),'2026-11-30T05:00:00.000Z');
  assert.equal(winter.current.end.toISOString(),'2026-12-07T05:00:00.000Z');
});

function event(event_type,visitor_key,session_key,extra={}){
  return {event_type,visitor_key,session_key,occurred_at:'2026-09-01T12:00:00Z',...extra};
}

const currentEvents=[
  event('search_completed','v1','s1',{query_text:'horror movies',genre_words:['horror'],requested_provider:'Netflix',result_count:10}),
  event('provider_click','v1','s1',{movie_title:'Alien',provider:'Prime Video',monetization_type:'FLATRATE'}),
  event('search_completed','v1','s2',{query_text:'Denzel Washington crime movies',genre_words:['crime'],person_name:'Denzel Washington',person_role:'cast',result_count:8}),
  event('provider_click','v1','s2',{movie_title:'Training Day',provider:'Prime Video',monetization_type:'RENT',price:3.99}),
  event('search_no_results','v2','s3',{query_text:'1990s crime movies',genre_words:['crime'],result_count:0})
];

const comparisonEvents=[
  event('search_completed','old','old-session',{query_text:'horror movies',genre_words:['horror'],result_count:7}),
  event('provider_click','old','old-session',{movie_title:'Alien',provider:'Netflix',monetization_type:'FLATRATE'})
];

test('weekly aggregation computes real audience, demand, conversion, and commercial-intent metrics', () => {
  const window=getWeeklyWindows(new Date('2026-09-07T12:00:00Z')).current;
  const summary=aggregateWeeklyReport({currentEvents,comparisonEvents,priorVisitorKeys:new Set(['v1']),window});
  assert.equal(summary.activeVisitors,2);
  assert.equal(summary.sessions,3);
  assert.equal(summary.searches,3);
  assert.equal(summary.returningVisitorRate,50);
  assert.equal(summary.searchesPerVisitor,1.5);
  assert.equal(summary.noResultRate,33.3);
  assert.equal(summary.providerClicks,2);
  assert.equal(summary.searchToProviderClickRate,66.7);
  assert.equal(summary.topClickedProviders[0].name,'Prime Video');
  assert.equal(summary.topClickedProviders[0].count,2);
  assert.ok(summary.topPeople.some(x=>x.name==='Denzel Washington'));
  assert.ok(summary.topGenres.some(x=>x.name==='crime'&&x.count===2));
  assert.ok(summary.topRequestedProviders.some(x=>x.name==='Netflix'));
  assert.ok(summary.topClickedTitles.some(x=>x.name==='Training Day'));
  assert.deepEqual(summary.accessTypeClicks,{FREE:0,ADS:0,FLATRATE:1,RENT:1,BUY:0});
  assert.equal(summary.priceBands.under5,1);
  assert.equal(summary.weekOverWeek.searchesPct,200);
});

test('deterministic observations describe measured facts without inventing transactions or revenue', () => {
  const window=getWeeklyWindows(new Date('2026-09-07T12:00:00Z')).current;
  const summary=aggregateWeeklyReport({currentEvents,comparisonEvents,priorVisitorKeys:new Set(['v1']),window});
  const observations=buildObservations(summary);
  assert.ok(observations.includes('Prime Video received the most outbound provider clicks.'));
  assert.ok(observations.every(x=>!/(revenue|purchase completed|watched)/i.test(x)));
});
