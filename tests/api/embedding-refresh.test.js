import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmbeddingRefreshHandler } from '../../api/embedding-refresh.js';

function responseRecorder(){
  return {statusCode:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
}

test('embedding refresh cron requires Vercel cron authorization',async()=>{
  let calls=0;
  const handler=createEmbeddingRefreshHandler({
    env:{CRON_SECRET:'secret'},
    maintainer:{run:async()=>{calls+=1;return {};}}
  });
  const res=responseRecorder();
  await handler({method:'GET',headers:{}},res);
  assert.equal(res.statusCode,401);
  assert.equal(calls,0);
});

test('embedding refresh updates bounded movie and show batches',async()=>{
  const calls=[];
  const handler=createEmbeddingRefreshHandler({
    env:{CRON_SECRET:'secret',EMBEDDING_REFRESH_BATCH_SIZE:'24'},
    maintainer:{run:async options=>{
      calls.push(options);
      return {processed:2,updated:2,failed:0,mediaType:options.mediaType};
    }}
  });
  const res=responseRecorder();
  await handler({method:'GET',headers:{authorization:'Bearer secret'}},res);
  assert.equal(res.statusCode,200);
  assert.deepEqual(calls,[
    {mediaType:'movies',batchSize:24},
    {mediaType:'shows',batchSize:24}
  ]);
  assert.equal(res.body.updated,4);
  assert.equal(res.body.failed,0);
});

test('embedding refresh is unavailable when catalog maintainer is not configured',async()=>{
  const handler=createEmbeddingRefreshHandler({env:{CRON_SECRET:'secret'},maintainer:null});
  const res=responseRecorder();
  await handler({method:'GET',headers:{authorization:'Bearer secret'}},res);
  assert.equal(res.statusCode,503);
  assert.equal(res.body.code,'EMBEDDING_MAINTAINER_NOT_CONFIGURED');
});

test('embedding refresh reports partial failures without exposing secrets',async()=>{
  const handler=createEmbeddingRefreshHandler({
    env:{CRON_SECRET:'super-secret'},
    logger:{warn(){}},
    maintainer:{run:async ({mediaType})=>{
      if(mediaType==='shows') throw new Error('provider failed super-secret');
      return {processed:1,updated:1,failed:0,mediaType};
    }}
  });
  const res=responseRecorder();
  await handler({method:'GET',headers:{authorization:'Bearer super-secret'}},res);
  assert.equal(res.statusCode,207);
  assert.equal(res.body.updated,1);
  assert.equal(res.body.failed,1);
  assert.ok(!JSON.stringify(res.body).includes('super-secret'));
});
