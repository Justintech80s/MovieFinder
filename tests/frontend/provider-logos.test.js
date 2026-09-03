const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');

test('streaming offer cards render provider logos when available',()=>{
  assert.match(html,/providerLogoUrl/);
  assert.match(html,/class="provider-logo"/);
  assert.match(html,/offer\?\.package\?\.icon|offer\?\.logo|offer\?\.providerLogo/);
});

test('provider logo rendering keeps an initials fallback',()=>{
  assert.match(html,/provider-fallback/);
  assert.match(html,/providerInitials\(provider\)/);
});
