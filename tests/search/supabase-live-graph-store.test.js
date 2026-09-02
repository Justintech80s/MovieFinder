import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseLiveGraphStore } from '../../lib/search/supabase-live-graph-store.js';

test('server-side Supabase graph store resolves an exact movie title and performs bounded traversal', async () => {
  const calls=[];
  const rows={
    seed:{id:'db-seed',entity_type:'Movie',canonical_key:'wikidata:Q164030',name:'The Conversation',properties:{releaseYear:1974}},
    related:{id:'db-related',entity_type:'Movie',canonical_key:'wikidata:Q661474',name:'The Parallax View',properties:{releaseYear:1974}}
  };
  const fetchImpl=async(url,options={})=>{
    const parsed=new URL(url);
    calls.push({parsed,options});
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers.apikey,'service-key');
    assert.equal(options.headers.authorization,'Bearer service-key');

    if(parsed.pathname.endsWith('/cinema_entities') && parsed.searchParams.get('name')==='ilike.The Conversation'){
      return {ok:true,status:200,json:async()=>[rows.seed]};
    }
    if(parsed.pathname.endsWith('/cinema_entities') && parsed.searchParams.get('canonical_key')==='eq.wikidata:Q164030'){
      return {ok:true,status:200,json:async()=>[rows.seed]};
    }
    if(parsed.pathname.endsWith('/cinema_relations')){
      assert.equal(parsed.searchParams.get('from_entity_id'),'eq.db-seed');
      assert.equal(parsed.searchParams.get('limit'),'5');
      return {ok:true,status:200,json:async()=>[{from_entity_id:'db-seed',to_entity_id:'db-related',relation_type:'SIMILAR_TO',properties:{},confidence:0.9}]};
    }
    if(parsed.pathname.endsWith('/cinema_entities') && parsed.searchParams.get('id')==='in.(db-related)'){
      return {ok:true,status:200,json:async()=>[rows.related]};
    }
    throw new Error(`unexpected graph request ${url}`);
  };

  const store=createSupabaseLiveGraphStore({
    fetchImpl,
    env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-key',CINEMA_GRAPH_DB_TIMEOUT_MS:'1200'}
  });

  const seed=await store.findMovieByTitle('The Conversation');
  assert.equal(seed.id,'wikidata:Q164030');
  assert.equal(seed.title,'The Conversation');
  assert.equal(seed.year,1974);

  const edges=await store.traverse(seed.id,{maxDepth:1,maxResults:5});
  assert.deepEqual(edges,[{from:'wikidata:Q164030',to:'wikidata:Q661474',type:'SIMILAR_TO',properties:{},confidence:0.9}]);
  assert.ok(calls.length>=4);
});

test('unconfigured Supabase graph store stays disabled without network access', async () => {
  let calls=0;
  const store=createSupabaseLiveGraphStore({fetchImpl:async()=>{calls+=1;throw new Error('network should not run');},env:{}});
  assert.equal(store,null);
  assert.equal(calls,0);
});
