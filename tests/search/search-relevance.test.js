import test from 'node:test';
import assert from 'node:assert/strict';
import {expandSearchQuery} from '../../lib/search/query-expansion.js';
import {buildHybridRankings} from '../../lib/search/hybrid-search.js';
import {reciprocalRankFusion} from '../../lib/search/rank-fusion.js';
import {finalizeHybridResults} from '../../lib/search/rank.js';
import {matchesHardConstraints} from '../../lib/search/constraints.js';

const movie=(id,title,extra={})=>({id,title,year:extra.year||1995,description:extra.description||'',genres:extra.genres||[],tags:extra.tags||[],offers:extra.offers||[],ratings:{imdb:extra.imdb||8}});
function hybrid(query,candidates,intent={}){const parsed={raw:query,titleQuery:intent.titleQuery??null,concepts:intent.concepts||[],...intent};const built=buildHybridRankings(candidates,expandSearchQuery(query),parsed);return finalizeHybridResults(reciprocalRankFusion(built.lists),built.signalsById,parsed);}

test('Goodfellas-like benchmark rewards crime metadata',()=>{const results=hybrid('movies like Goodfellas',[movie('casino','Casino',{description:'gangster crime drama',genres:['Crime']}),movie('space','Space Journey',{description:'science fiction voyage',genres:['Science Fiction']})]);assert.equal(results[0].id,'casino');});
test('1970s paranoid thriller benchmark rewards Cinema Graph concept',()=>{const results=hybrid('1970s paranoid thrillers',[movie('parallax','The Parallax View',{year:1974,description:'conspiracy paranoia',genres:['Thriller'],tags:['paranoia']}),movie('comedy','Funny Days',{year:1974,genres:['Comedy']})],{concepts:['paranoid']});assert.equal(results[0].id,'parallax');});
test('Kurosawa influence wording rewards matching evidence tokens',()=>{const results=hybrid('crime movies influenced by Kurosawa',[movie('influenced','Crime Story',{description:'crime film influenced by Kurosawa',genres:['Crime']}),movie('other','Crime Two',{description:'crime film',genres:['Crime']})]);assert.equal(results[0].id,'influenced');});
test('Godfellas typo benchmark still retrieves Goodfellas strongly',()=>{const results=hybrid('Godfellas',[movie('goodfellas','Goodfellas',{genres:['Crime']}),movie('unrelated','Godzilla',{genres:['Action']})],{titleQuery:'Godfellas'});assert.equal(results[0].id,'goodfellas');assert.ok(results[0].searchSignals.lexical>.5);});
test('provider constraint benchmark excludes unavailable providers before ranking',()=>{const intent={provider:'Netflix'};const candidates=[movie('n','Netflix Film',{offers:[{provider:'Netflix',type:'FLATRATE'}]}),movie('h','Hulu Film',{offers:[{provider:'Hulu',type:'FLATRATE'}]})].filter(x=>matchesHardConstraints(x,intent));assert.deepEqual(candidates.map(x=>x.id),['n']);});
