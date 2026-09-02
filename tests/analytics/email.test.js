import test from 'node:test';
import assert from 'node:assert/strict';
import { renderWeeklyEmail, sendWeeklyEmail } from '../../lib/analytics/email.js';

const summary={
  window:{startKey:'2026-08-31',endKey:'2026-09-07'},
  activeVisitors:2140,sessions:3012,searches:6430,returningVisitorRate:27.2,searchesPerVisitor:3,
  noResults:312,noResultRate:4.9,failures:21,failureRate:0.3,providerClicks:1490,searchToProviderClickRate:53,
  topQueries:[{name:'The Godfather',count:210}],
  topPeople:[{name:'Denzel Washington',count:180}],
  topGenres:[{name:'horror',count:430}],
  topRequestedProviders:[{name:'Netflix',count:520}],
  topClickedProviders:[{name:'Prime Video',count:610}],
  topClickedTitles:[{name:'Training Day',count:122}],
  accessTypeClicks:{FREE:300,ADS:442,FLATRATE:410,RENT:210,BUY:128},
  priceBands:{under5:180,from5To9_99:90,from10To19_99:40,twentyPlus:28},
  topProblemQueries:[{name:'1990s crime movies',total:20,noResults:12,noResultRate:60,failures:0,failureRate:0}],
  weekOverWeek:{activeVisitorsPct:18,sessionsPct:12,searchesPct:21,providerClicksPct:16},
  observations:['Prime Video received the most outbound provider clicks.']
};

test('weekly email contains required business sections and truthful data note', () => {
  const message=renderWeeklyEmail(summary);
  assert.equal(message.subject,'MovieFinder Weekly Report — Aug 31–Sep 6');
  for(const section of ['Growth','What people wanted','Commercial activity','Conversion','Search problems','Opportunities']){
    assert.match(message.text,new RegExp(section));
    assert.match(message.html,new RegExp(section));
  }
  assert.match(message.text,/Active anonymous visitors/i);
  assert.match(message.text,/outbound intent/i);
  assert.match(message.text,/Prime Video/);
  assert.doesNotMatch(message.text,/completed purchase/i);
});

test('email renderer escapes query text in HTML', () => {
  const message=renderWeeklyEmail({...summary,topQueries:[{name:'<script>alert(1)</script>',count:1}]});
  assert.doesNotMatch(message.html,/<script>/i);
  assert.match(message.html,/&lt;script&gt;/i);
});

test('Resend transport sends HTML and plain text to configured Gmail destination', async () => {
  const seen=[];
  const fetchImpl=async (url,init)=>{
    seen.push({url:String(url),init});
    return {ok:true,status:200,json:async()=>({id:'email_123'})};
  };
  const result=await sendWeeklyEmail({
    message:renderWeeklyEmail(summary),
    fetchImpl,
    env:{RESEND_API_KEY:'resend-test-key',ANALYTICS_REPORT_TO:'owner@example.com',ANALYTICS_REPORT_FROM:'MovieFinder <reports@moviefinder.example>'}
  });
  assert.equal(result.id,'email_123');
  assert.equal(seen[0].url,'https://api.resend.com/emails');
  assert.equal(seen[0].init.method,'POST');
  assert.equal(seen[0].init.headers.authorization,'Bearer resend-test-key');
  const body=JSON.parse(seen[0].init.body);
  assert.equal(body.to,'owner@example.com');
  assert.equal(body.from,'MovieFinder <reports@moviefinder.example>');
  assert.match(body.html,/MovieFinder Weekly Report/);
  assert.match(body.text,/Growth/);
});

test('missing email configuration fails before network I/O', async () => {
  let calls=0;
  await assert.rejects(()=>sendWeeklyEmail({message:renderWeeklyEmail(summary),env:{},fetchImpl:async()=>{calls++;}}),/email configuration/i);
  assert.equal(calls,0);
});
