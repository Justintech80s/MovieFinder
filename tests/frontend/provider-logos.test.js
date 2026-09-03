import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
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
