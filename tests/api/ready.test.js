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
