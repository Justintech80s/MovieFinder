import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('movie cards prefer richer verified search explanation over generic catalog description',()=>{
  const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
  assert.match(
    html,
    /item\.searchExplanation\|\|item\.ai\?\.explanation\|\|item\.cinemaWhy\|\|item\.description\|\|item\.synopsis/
  );
});
