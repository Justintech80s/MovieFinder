import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSearchPlan} from '../lib/search/planner.js';

const tools=plan=>plan.steps.map(x=>x.tool);
test('person streaming query plans filmography and availability',()=>{const plan=buildSearchPlan({raw:'all Will Smith movies streaming',personName:'Will Smith'});assert.deepEqual(tools(plan),['personSearch','filmography','availability']);assert.equal(plan.needsAvailability,true);});
test('relationship query uses Cinema Graph',()=>{assert.deepEqual(tools(buildSearchPlan({raw:'crime movies influenced by Kurosawa'})),['cinemaGraph']);});
test('unknown query safely uses baseline search and can disable AI',()=>{const plan=buildSearchPlan({raw:'something interesting',allowAI:false});assert.deepEqual(tools(plan),['baselineSearch']);assert.equal(plan.allowAI,false);});
