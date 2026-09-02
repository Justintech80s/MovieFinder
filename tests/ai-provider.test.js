import test from 'node:test';
import assert from 'node:assert/strict';
import {getModelProvider,createHttpProvider} from '../lib/ai/index.js';

test('AI defaults to an explicit no-op provider',async()=>{const result=await getModelProvider({}).generateStructured({task:'rank'});assert.equal(result.available,false);assert.equal(result.reason,'ai-disabled');});
test('HTTP provider returns structured JSON',async()=>{const old=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>({claims:['Crime']})});try{const result=await createHttpProvider({url:'https://model.invalid'}).generateStructured({task:'enrich',input:{}});assert.equal(result.ok,true);assert.deepEqual(result.data,{claims:['Crime']});}finally{globalThis.fetch=old;}});
test('HTTP provider fails closed on malformed JSON',async()=>{const old=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>{throw new SyntaxError('bad json');}});try{const result=await createHttpProvider({url:'https://model.invalid'}).generateStructured({task:'enrich'});assert.equal(result.ok,false);assert.equal(result.reason,'provider-error');}finally{globalThis.fetch=old;}});
test('HTTP provider reports upstream HTTP failure',async()=>{const old=globalThis.fetch;globalThis.fetch=async()=>({ok:false,status:503});try{const result=await createHttpProvider({url:'https://model.invalid'}).generateStructured({task:'enrich'});assert.equal(result.ok,false);assert.equal(result.reason,'http-503');}finally{globalThis.fetch=old;}});
