import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseHybridSearch } from '../../lib/search/supabase-hybrid-search.js';

test('unconfigured Supabase hybrid search stays disabled',()=>{
  assert.equal(createSupabaseHybridSearch({env:{},fetchImpl:async()=>{throw new Error('network');}}),null);
});

test('full-text search calls bounded movie and show RPCs and normalizes candidates',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    const rpc=String(url).split('/rpc/')[1];
    const data=rpc==='search_movies_full_text'
      ? [{id:'m1',title:'Heat',release_year:1995,description:'Crime drama',rank:.8}]
      : [{id:'s1',title:'The Bear',first_release_year:2022,description:'Kitchen drama',rank:.7}];
    return {ok:true,status:200,json:async()=>data};
  };
  const search=createSupabaseHybridSearch({
    fetchImpl,
    env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret'}
  });
  const result=await search.fullTextSearch({query:'intense crime drama'});
  assert.deepEqual(result.map(x=>[x.id,x.mediaType,x.year]),[
    ['m1','MOVIE',1995],
    ['s1','SHOW',2022]
  ]);
  assert.equal(calls.length,2);
  assert.ok(calls.every(call=>call.options.method==='POST'));
  assert.ok(calls.every(call=>JSON.parse(call.options.body).match_count===40));
  assert.ok(calls.every(call=>!JSON.stringify(call).includes('Bearer undefined')));
});

test('one failed RPC does not erase candidates from the other media type',async()=>{
  const fetchImpl=async(url)=>{
    if(String(url).includes('search_movies_full_text')) return {ok:false,status:503,json:async()=>({})};
    return {ok:true,status:200,json:async()=>[
      {id:'s1',title:'Dark',first_release_year:2017,description:'Mystery',rank:.9}
    ]};
  };
  const search=createSupabaseHybridSearch({
    fetchImpl,
    env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret'}
  });
  const result=await search.fullTextSearch({query:'dark mystery'});
  assert.deepEqual(result.map(x=>x.title),['Dark']);
});
