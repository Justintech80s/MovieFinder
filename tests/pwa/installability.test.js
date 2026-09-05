import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest=JSON.parse(fs.readFileSync(new URL('../../manifest.webmanifest',import.meta.url),'utf8'));
const sw=fs.readFileSync(new URL('../../sw.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');

test('PWA manifest supports standalone MovieFinder installation',()=>{
  assert.equal(manifest.name,'MovieFinder');
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.start_url,'/');
  assert.equal(manifest.scope,'/');
  assert.ok(manifest.icons.some(icon=>icon.sizes==='192x192'&&icon.type==='image/png'));
  assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'&&icon.type==='image/png'&&icon.purpose==='any'));
  assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'&&icon.type==='image/png'&&icon.purpose==='maskable'));
});

test('service worker keeps API searches network-first and does not freeze streaming availability',()=>{
  assert.match(sw,/\/api\//);
  assert.match(sw,/fetch\(request\)/);
  assert.match(sw,/moviefinder-192\.png/);
  assert.match(sw,/moviefinder-512\.png/);
  assert.doesNotMatch(sw,/cache\.put\(request.*api/i);
});

test('existing page opts into PWA metadata and service worker without adding visible UI',()=>{
  assert.match(html,/rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html,/apple-mobile-web-app-capable/);
  assert.match(html,/rel="apple-touch-icon" href="\/icons\/moviefinder-192\.png"/);
  assert.match(html,/navigator\.serviceWorker\.register\('\/sw\.js'\)/);
  assert.doesNotMatch(html,/id="installApp"|class="install-app"/);
});
