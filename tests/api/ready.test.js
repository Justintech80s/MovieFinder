import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadyHandler } from '../../api/ready.js';

function responseRecorder(){
  return {
    statusCode:200,body:null,headers:{},
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    status(code){this.statusCode=code;return this;},
    json(body){this.body=body;return this;}
  };
}

test('readiness endpoint returns 200 for deterministic-only configuration', async () => {
  const handler=createReadyHandler({env:{}});
  const res=responseRecorder();
  await handler({method:'GET'},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.ready,true);
});

test('readiness endpoint returns 503 when configured required database check fails', async () => {
  const handler=createReadyHandler({
    env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret'},
    checks:{database:async()=>false}
  });
  const res=responseRecorder();
  await handler({method:'GET'},res);
  assert.equal(res.statusCode,503);
  assert.equal(res.body.ready,false);
  assert.doesNotMatch(JSON.stringify(res.body),/secret/);
});


test('configured database readiness check is bounded by timeout', async () => {
  const handler=createReadyHandler({
    env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret'},
    checks:{database:async()=>new Promise(()=>{})},
    checkTimeoutMs:5
  });
  const res=responseRecorder();
  await handler({method:'GET'},res);
  assert.equal(res.statusCode,503);
  assert.equal(res.body.subsystems.database.status,'unavailable');
});

test('optional cache Python and AI readiness checks time out without failing overall readiness', async () => {
  const never=async()=>new Promise(()=>{});
  const handler=createReadyHandler({
    env:{
      REDIS_URL:'rediss://cache.example.com',
      PYTHON_BRAIN_URL:'https://brain.example.com',
      OPENAI_API_KEY:'secret',
      OPENAI_MODEL:'gpt-test'
    },
    checks:{cache:never,python:never,ai:never},
    checkTimeoutMs:5
  });
  const res=responseRecorder();
  await handler({method:'GET'},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.ready,true);
  assert.equal(res.body.subsystems.cache.status,'unavailable');
  assert.equal(res.body.subsystems.python.status,'unavailable');
  assert.equal(res.body.subsystems.ai.status,'unavailable');
});
