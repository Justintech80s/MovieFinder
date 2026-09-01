import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutboundToken } from '../../lib/analytics/outbound.js';
import { createOutboundHandler } from '../../api/out.js';

function responseRecorder(){
  const headers=new Map();
  return {
    statusCode:200,
    body:null,
    ended:false,
    status(code){this.statusCode=code;return this;},
    json(body){this.body=body;return this;},
    setHeader(name,value){headers.set(name.toLowerCase(),value);return this;},
    getHeader(name){return headers.get(name.toLowerCase());},
    end(){this.ended=true;return this;}
  };
}

function request(token){
  return {query:{token},headers:{cookie:'mf_vid=v1; mf_sid=s1'}};
}

const payload={destination:'https://example.com/watch',movieId:'m1',movieTitle:'The Godfather',movieYear:1972,provider:'Prime Video',monetizationType:'RENT',price:3.99};
const now=()=>new Date('2026-09-01T12:00:00Z');
const nowMs=()=>Date.parse('2026-09-01T12:00:00Z');

test('valid token records provider click and redirects to original destination', async () => {
  const events=[];
  const token=createOutboundToken(payload,'outbound-secret',{nowMs:nowMs(),ttlMs:60000});
  const handler=createOutboundHandler({analyticsStore:{insertEvent:async event=>{events.push(event);return true;}},analyticsSecret:'analytics-secret',outboundSecret:'outbound-secret',now,logger:{warn:()=>{}}});
  const res=responseRecorder();
  await handler(request(token),res);
  assert.equal(res.statusCode,302);
  assert.equal(res.getHeader('location'),'https://example.com/watch');
  assert.equal(events.length,1);
  assert.equal(events[0].event_type,'provider_click');
  assert.equal(events[0].movie_title,'The Godfather');
  assert.equal(events[0].provider,'Prime Video');
  assert.equal(events[0].monetization_type,'RENT');
});

test('analytics database failure does not block a valid redirect', async () => {
  const token=createOutboundToken(payload,'outbound-secret',{nowMs:nowMs(),ttlMs:60000});
  const handler=createOutboundHandler({analyticsStore:{insertEvent:async()=>{throw new Error('db down');}},analyticsSecret:'analytics-secret',outboundSecret:'outbound-secret',now,logger:{warn:()=>{}}});
  const res=responseRecorder();
  await handler(request(token),res);
  assert.equal(res.statusCode,302);
  assert.equal(res.getHeader('location'),'https://example.com/watch');
});

test('invalid token never redirects', async () => {
  const handler=createOutboundHandler({analyticsStore:{insertEvent:async()=>true},analyticsSecret:'analytics-secret',outboundSecret:'outbound-secret',now,logger:{warn:()=>{}}});
  const res=responseRecorder();
  await handler(request('tampered.token'),res);
  assert.equal(res.statusCode,400);
  assert.equal(res.getHeader('location'),undefined);
});
