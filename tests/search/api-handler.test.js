import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/search.js';

function responseRecorder(){
  return {
    statusCode:200,
    body:null,
    status(code){this.statusCode=code;return this;},
    json(body){this.body=body;return this;}
  };
}

test('generic search returns a controlled availability-unavailable response for upstream HTTP failure', async () => {
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async()=>({ok:false,status:503,json:async()=>({})});
  try {
    const res=responseRecorder();
    await handler({query:{q:'Where can I watch The Godfather?'}},res);
    assert.equal(res.statusCode,503);
    assert.equal(res.body.code,'AVAILABILITY_UNAVAILABLE');
    assert.match(res.body.error,/availability/i);
  } finally {
    globalThis.fetch=previousFetch;
  }
});
