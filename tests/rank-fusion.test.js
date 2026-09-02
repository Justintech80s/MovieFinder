import test from 'node:test';
import assert from 'node:assert/strict';

test('RRF rewards candidates appearing strongly across lists',async()=>{
 const {reciprocalRankFusion}=await import('../lib/search/rank-fusion.js');
 const a={id:'a',title:'Alpha',year:2000},b={id:'b',title:'Beta',year:2001},c={id:'c',title:'Gamma',year:2002};
 const fused=reciprocalRankFusion([{name:'lexical',results:[a,b,c]},{name:'semantic',results:[b,a,c]}]);
 assert.equal(fused[0].id,'a');
 assert.equal(fused[1].id,'b');
 assert.ok(fused[0].rrfScore>0);
 assert.deepEqual(Object.keys(fused[0].rrfContributions).sort(),['lexical','semantic']);
});

test('RRF deduplicates title/year when ids are absent and stays deterministic',async()=>{
 const {reciprocalRankFusion}=await import('../lib/search/rank-fusion.js');
 const one={title:'Heat',year:1995},duplicate={title:'HEAT',year:1995},other={title:'Casino',year:1995};
 const fused=reciprocalRankFusion([{name:'one',results:[one,other]},{name:'two',results:[duplicate,other]}]);
 assert.equal(fused.filter(x=>x.title.toLowerCase()==='heat').length,1);
 assert.deepEqual(fused.map(x=>x.title.toLowerCase()),['heat','casino']);
});
