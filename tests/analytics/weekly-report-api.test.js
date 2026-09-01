import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeeklyReportHandler } from '../../api/weekly-report.js';

function responseRecorder(){
  return {
    statusCode:200,body:null,
    status(code){this.statusCode=code;return this;},
    json(body){this.body=body;return this;}
  };
}

function req(auth='Bearer cron-secret'){
  return {headers:{authorization:auth}};
}

function fakeStore({existing=null,failSet=false}={}){
  const calls={runs:[],lists:[],prior:[],cleanup:[]};
  const currentEvents=[
    {event_type:'search_completed',visitor_key:'v1',session_key:'s1',query_text:'The Godfather',occurred_at:'2026-09-01T12:00:00Z',result_count:10},
    {event_type:'provider_click',visitor_key:'v1',session_key:'s1',movie_title:'The Godfather',provider:'Prime Video',monetization_type:'RENT',price:3.99,occurred_at:'2026-09-01T12:01:00Z'}
  ];
  const comparisonEvents=[
    {event_type:'search_completed',visitor_key:'old',session_key:'old',query_text:'Alien',occurred_at:'2026-08-25T12:00:00Z',result_count:5}
  ];
  return {
    enabled:true,
    calls,
    async getReportRun(){return existing;},
    async setReportRun(run){calls.runs.push(run);if(failSet) throw new Error('run store down');return true;},
    async listEvents({start,end}){
      calls.lists.push({start,end});
      return start.toISOString()==='2026-08-31T04:00:00.000Z'?currentEvents:comparisonEvents;
    },
    async listPriorVisitorKeys(keys,before){calls.prior.push({keys,before});return new Set(['v1']);},
    async deleteEventsBefore(cutoff){calls.cleanup.push(cutoff);return true;}
  };
}

const env={CRON_SECRET:'cron-secret',ANALYTICS_REPORT_TO:'owner@example.com',ANALYTICS_REPORT_FROM:'MovieFinder <reports@example.com>',RESEND_API_KEY:'key'};

test('weekly report endpoint rejects missing or incorrect cron authorization', async () => {
  const handler=createWeeklyReportHandler({store:fakeStore(),sendEmail:async()=>({id:'x'}),now:()=>new Date('2026-09-07T12:00:00Z'),env,logger:{warn:()=>{}}});
  for(const auth of [undefined,'Bearer wrong']){
    const res=responseRecorder();
    await handler(req(auth),res);
    assert.equal(res.statusCode,401);
  }
});

test('Monday 08:00 New York sends one real report, marks it sent, and cleans expired events', async () => {
  const store=fakeStore();
  const emails=[];
  const handler=createWeeklyReportHandler({store,sendEmail:async args=>{emails.push(args);return {id:'email_1'};},now:()=>new Date('2026-09-07T12:00:00Z'),env,logger:{warn:()=>{}}});
  const res=responseRecorder();
  await handler(req(),res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.success,true);
  assert.equal(emails.length,1);
  assert.match(emails[0].message.subject,/Aug 31–Sep 6/);
  assert.equal(store.calls.lists.length,2);
  assert.equal(store.calls.prior.length,1);
  assert.equal(store.calls.runs[0].status,'processing');
  assert.equal(store.calls.runs.at(-1).status,'sent');
  assert.equal(store.calls.runs.at(-1).event_count,2);
  assert.equal(store.calls.cleanup.length,1);
});

test('Monday 09:00 New York may retry an unsent report', async () => {
  const store=fakeStore({existing:{week_start:'2026-08-31',status:'failed'}});
  let sent=0;
  const handler=createWeeklyReportHandler({store,sendEmail:async()=>{sent++;return {id:'email_2'};},now:()=>new Date('2026-09-07T13:00:00Z'),env,logger:{warn:()=>{}}});
  const res=responseRecorder();
  await handler(req(),res);
  assert.equal(res.statusCode,200);
  assert.equal(sent,1);
  assert.equal(store.calls.runs.at(-1).status,'sent');
});

test('already-sent week never sends a duplicate email', async () => {
  const store=fakeStore({existing:{week_start:'2026-08-31',status:'sent'}});
  let sent=0;
  const handler=createWeeklyReportHandler({store,sendEmail:async()=>{sent++;},now:()=>new Date('2026-09-07T12:00:00Z'),env,logger:{warn:()=>{}}});
  const res=responseRecorder();
  await handler(req(),res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.skipped,'already_sent');
  assert.equal(sent,0);
});

test('cron invocation outside Monday 08:00–09:59 New York is harmlessly skipped', async () => {
  const store=fakeStore();
  let sent=0;
  const handler=createWeeklyReportHandler({store,sendEmail:async()=>{sent++;},now:()=>new Date('2026-09-07T14:00:00Z'),env,logger:{warn:()=>{}}});
  const res=responseRecorder();
  await handler(req(),res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.skipped,'outside_local_window');
  assert.equal(sent,0);
});

test('email delivery failure marks the week failed and remains retryable', async () => {
  const store=fakeStore();
  const handler=createWeeklyReportHandler({store,sendEmail:async()=>{throw new Error('email down');},now:()=>new Date('2026-09-07T12:00:00Z'),env,logger:{warn:()=>{}}});
  const res=responseRecorder();
  await handler(req(),res);
  assert.equal(res.statusCode,500);
  assert.equal(store.calls.runs.at(-1).status,'failed');
  assert.match(store.calls.runs.at(-1).last_error,/email down/);
  assert.equal(store.calls.runs.some(run=>run.status==='sent'),false);
});
