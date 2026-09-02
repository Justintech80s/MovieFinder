import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutboundHandler } from '../../api/out.js';
import { createWeeklyReportHandler } from '../../api/weekly-report.js';

function responseRecorder(){
  const headers={};
  return {
    statusCode:200,body:null,headers,ended:false,
    status(code){this.statusCode=code;return this;},
    json(body){this.body=body;return this;},
    setHeader(name,value){headers[String(name).toLowerCase()]=String(value);return this;},
    end(){this.ended=true;return this;}
  };
}

test('outbound redirect is GET-only and applies defensive headers before token work', async()=>{
  const handler=createOutboundHandler({outboundSecret:'test-secret',analyticsStore:{enabled:false}});
  const res=responseRecorder();
  await handler({method:'POST',query:{token:'bad'},headers:{},socket:{remoteAddress:'127.0.0.1'}},res);
  assert.equal(res.statusCode,405);
  assert.equal(res.headers.allow,'GET');
  assert.equal(res.headers['x-content-type-options'],'nosniff');
  assert.equal(res.headers['referrer-policy'],'no-referrer');
  assert.equal(res.headers['cache-control'],'no-store');
});

test('weekly report is GET-only and applies defensive headers before authorization', async()=>{
  const handler=createWeeklyReportHandler({env:{CRON_SECRET:'cron-secret'}});
  const res=responseRecorder();
  await handler({method:'POST',headers:{authorization:'Bearer cron-secret'}},res);
  assert.equal(res.statusCode,405);
  assert.equal(res.headers.allow,'GET');
  assert.equal(res.headers['x-content-type-options'],'nosniff');
  assert.equal(res.headers['referrer-policy'],'no-referrer');
  assert.equal(res.headers['cache-control'],'no-store');
});

test('weekly report preserves bearer-secret authorization on GET', async()=>{
  const handler=createWeeklyReportHandler({env:{CRON_SECRET:'cron-secret'}});
  const res=responseRecorder();
  await handler({method:'GET',headers:{authorization:'Bearer wrong-secret'}},res);
  assert.equal(res.statusCode,401);
  assert.deepEqual(res.body,{success:false});
});
