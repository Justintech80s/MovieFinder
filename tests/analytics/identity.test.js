import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAnalyticsIdentity } from '../../lib/analytics/identity.js';

function resRecorder(){
  const headers = new Map();
  return {
    setHeader(name, value){ headers.set(name.toLowerCase(), value); },
    getHeader(name){ return headers.get(name.toLowerCase()); }
  };
}

test('new visitor gets persistent visitor and short session cookies', () => {
  const res = resRecorder();
  const ids=['visitor-raw','session-raw'];
  const identity = resolveAnalyticsIdentity({headers:{cookie:''}}, res, {
    secret:'test-secret',
    randomId:()=>ids.shift(),
    secure:false
  });
  const cookies = res.getHeader('set-cookie');
  assert.ok(Array.isArray(cookies));
  assert.ok(cookies.some(x=>x.startsWith('mf_vid=')));
  assert.ok(cookies.some(x=>x.startsWith('mf_sid=')));
  assert.ok(cookies.some(x=>x.includes('Max-Age=31536000')));
  assert.ok(cookies.some(x=>x.includes('Max-Age=1800')));
  assert.ok(cookies.every(x=>x.includes('HttpOnly')));
  assert.ok(cookies.every(x=>x.includes('SameSite=Lax')));
  assert.notEqual(identity.visitorKey, 'visitor-raw');
  assert.notEqual(identity.sessionKey, 'session-raw');
});

test('existing visitor/session cookies are reused but session lifetime is refreshed', () => {
  const res = resRecorder();
  const identity = resolveAnalyticsIdentity({headers:{cookie:'mf_vid=v1; mf_sid=s1'}}, res, {secret:'test-secret',secure:false});
  assert.ok(identity.visitorKey);
  assert.ok(identity.sessionKey);
  const cookies = res.getHeader('set-cookie');
  assert.equal(cookies.length, 1);
  assert.ok(cookies[0].startsWith('mf_sid=s1'));
  assert.ok(cookies[0].includes('Max-Age=1800'));
});

test('production cookies include Secure', () => {
  const res = resRecorder();
  resolveAnalyticsIdentity({headers:{cookie:'mf_vid=v1; mf_sid=s1'}}, res, {secret:'test-secret',secure:true});
  assert.ok(res.getHeader('set-cookie')[0].includes('Secure'));
});

test('missing analytics secret disables identity instead of exposing raw ids', () => {
  const res = resRecorder();
  assert.equal(resolveAnalyticsIdentity({headers:{}}, res, {secret:''}), null);
  assert.equal(res.getHeader('set-cookie'), undefined);
});
