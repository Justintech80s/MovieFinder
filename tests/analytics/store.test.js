import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyticsStore } from '../../lib/analytics/store.js';

test('insertEvent sends a server-side PostgREST insert with service-role auth', async () => {
  const seen=[];
  const store=createAnalyticsStore({
    env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-key'},
    fetchImpl:async (url,init)=>{
      seen.push({url:String(url),init});
      return {ok:true,status:201,json:async()=>[],headers:new Headers()};
    }
  });
  const event={event_type:'search_completed',visitor_key:'v',session_key:'s',occurred_at:'2026-09-01T12:00:00Z'};
  assert.equal(await store.insertEvent(event),true);
  assert.match(seen[0].url,/\/rest\/v1\/analytics_events$/);
  assert.equal(seen[0].init.method,'POST');
  assert.equal(seen[0].init.headers.apikey,'service-key');
  assert.equal(seen[0].init.headers.authorization,'Bearer service-key');
  assert.deepEqual(JSON.parse(seen[0].init.body),event);
});

test('analytics database requests use a bounded AbortSignal timeout', async () => {
  let seenSignal;
  const store=createAnalyticsStore({
    env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-key',ANALYTICS_DB_TIMEOUT_MS:'250'},
    fetchImpl:async (_url,init)=>{
      seenSignal=init.signal;
      return {ok:true,status:201,json:async()=>[],headers:new Headers()};
    }
  });
  await store.insertEvent({event_type:'search_completed'});
  assert.ok(seenSignal instanceof AbortSignal);
  assert.equal(seenSignal.aborted,false);
});

test('missing Supabase configuration disables writes without network calls', async () => {
  let calls=0;
  const store=createAnalyticsStore({env:{},fetchImpl:async()=>{calls++;throw new Error('should not run');}});
  assert.equal(store.enabled,false);
  assert.equal(await store.insertEvent({}),false);
  assert.equal(calls,0);
});

test('listEvents paginates until a short page', async () => {
  const seen=[];
  const pages=[Array.from({length:1000},(_,i)=>({id:`a${i}`})),[{id:'last'}]];
  const store=createAnalyticsStore({
    env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-key'},
    fetchImpl:async (url,init)=>{
      seen.push({url:String(url),init});
      return {ok:true,status:200,json:async()=>pages.shift(),headers:new Headers()};
    }
  });
  const rows=await store.listEvents({start:new Date('2026-08-31T04:00:00Z'),end:new Date('2026-09-07T04:00:00Z')});
  assert.equal(rows.length,1001);
  assert.equal(seen.length,2);
  assert.equal(seen[0].init.headers.Range,'0-999');
  assert.equal(seen[1].init.headers.Range,'1000-1999');
  assert.match(seen[0].url,/occurred_at=gte\./);
  assert.match(seen[0].url,/occurred_at=lt\./);
});

test('report runs upsert idempotently and cleanup deletes old events', async () => {
  const seen=[];
  const store=createAnalyticsStore({
    env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-key'},
    fetchImpl:async (url,init)=>{
      seen.push({url:String(url),init});
      return {ok:true,status:204,json:async()=>[],headers:new Headers()};
    }
  });
  await store.setReportRun({week_start:'2026-08-31',week_end:'2026-09-07',generated_at:'2026-09-07T12:00:00Z',status:'processing',event_count:0});
  await store.deleteEventsBefore(new Date('2026-06-01T00:00:00Z'));
  assert.equal(seen[0].init.method,'POST');
  assert.equal(seen[0].init.headers.Prefer,'resolution=merge-duplicates,return=minimal');
  assert.equal(seen[1].init.method,'DELETE');
  assert.match(seen[1].url,/analytics_events\?occurred_at=lt\./);
});
