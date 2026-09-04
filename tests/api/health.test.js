import test from 'node:test';
import assert from 'node:assert/strict';
import healthHandler from '../../api/health.js';

function responseRecorder(){
  return {
    statusCode:200,body:null,headers:{},
    setHeader(name,value){this.headers[String(name).toLowerCase()]=value;},
    status(code){this.statusCode=code;return this;},
    json(body){this.body=body;return this;}
  };
}

test('health endpoint is GET-only and returns shallow liveness', async () => {
  const bad=responseRecorder();
  await healthHandler({method:'POST'},bad);
  assert.equal(bad.statusCode,405);

  const good=responseRecorder();
  await healthHandler({method:'GET'},good);
  assert.equal(good.statusCode,200);
  assert.equal(good.body.status,'ok');
  assert.equal(good.headers['cache-control'],'no-store');
});
