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


test('semantic search gets a query embedding from Cinema Brain then calls vector RPCs',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url:String(url),options});
    if(String(url)==='https://brain.example.com/embed-query'){
      return {ok:true,status:200,json:async()=>({embedding:Array(384).fill(0.25),dimensions:384})};
    }
    if(String(url).includes('search_movies_semantic')){
      return {ok:true,status:200,json:async()=>[
        {id:'m1',title:'Heat',release_year:1995,description:'Crime drama',similarity:.93}
      ]};
    }
    if(String(url).includes('search_shows_semantic')){
      return {ok:true,status:200,json:async()=>[
        {id:'s1',title:'Miami Vice',first_release_year:1984,description:'Crime series',similarity:.82}
      ]};
    }
    throw new Error('unexpected URL');
  };
  const search=createSupabaseHybridSearch({
    fetchImpl,
    env:{
      SUPABASE_URL:'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'db-secret',
      PYTHON_BRAIN_URL:'https://brain.example.com'
    }
  });
  const result=await search.semanticSearch({query:'stylish Michael Mann crime'});
  assert.deepEqual(result.map(x=>[x.id,x.mediaType,x.semanticScore]),[
    ['m1','MOVIE',.93],
    ['s1','SHOW',.82]
  ]);
  const brainCall=calls.find(call=>call.url.includes('brain.example.com'));
  assert.deepEqual(JSON.parse(brainCall.options.body),{text:'stylish Michael Mann crime'});
  assert.ok(!JSON.stringify(brainCall.options.headers).includes('db-secret'));
  const rpcCalls=calls.filter(call=>call.url.includes('/rpc/search_'));
  assert.equal(rpcCalls.length,2);
  assert.ok(rpcCalls.every(call=>JSON.parse(call.options.body).query_embedding.length===384));
});

test('semantic search fails open when Cinema Brain cannot provide an embedding',async()=>{
  const fetchImpl=async(url)=>{
    if(String(url).includes('brain.example.com')) return {ok:false,status:503,json:async()=>({})};
    throw new Error('vector RPC must not run without embedding');
  };
  const search=createSupabaseHybridSearch({
    fetchImpl,
    env:{
      SUPABASE_URL:'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'secret',
      PYTHON_BRAIN_URL:'https://brain.example.com'
    }
  });
  assert.deepEqual(await search.semanticSearch({query:'crime thrillers'}),[]);
});
