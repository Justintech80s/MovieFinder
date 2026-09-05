import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogEmbeddingMaintainer, buildEmbeddingText } from '../../lib/ingestion/catalog-embedding-maintainer.js';

test('embedding text includes stable title year and description fields',()=>{
  assert.equal(
    buildEmbeddingText({title:'Heat',release_year:1995,description:'Crime drama'}),
    'Heat (1995). Crime drama'
  );
});

test('maintainer batches missing movie embeddings through Cinema Brain and persists vectors',async()=>{
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url).includes('/rest/v1/movies?')){
      return {ok:true,status:200,json:async()=>[
        {id:'m1',title:'Heat',release_year:1995,description:'Crime drama'},
        {id:'m2',title:'Thief',release_year:1981,description:'Crime thriller'}
      ]};
    }
    if(String(url)==='https://brain.example.com/embed-texts'){
      const body=JSON.parse(options.body);
      assert.deepEqual(body.texts,['Heat (1995). Crime drama','Thief (1981). Crime thriller']);
      return {ok:true,status:200,json:async()=>({
        embeddings:[Array(384).fill(.1),Array(384).fill(.2)],
        dimensions:384,
        model:'sentence-transformers/all-MiniLM-L6-v2'
      })};
    }
    if(String(url).includes('/rest/v1/movies?id=eq.')){
      const body=JSON.parse(options.body);
      assert.equal(body.embedding.length,384);
      assert.equal(body.embedding_model,'sentence-transformers/all-MiniLM-L6-v2');
      assert.ok(body.embedding_updated_at);
      return {ok:true,status:204,json:async()=>({})};
    }
    throw new Error('unexpected URL '+url);
  };
  const maintainer=createCatalogEmbeddingMaintainer({
    fetchImpl,
    env:{
      SUPABASE_URL:'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'db-secret',
      PYTHON_BRAIN_URL:'https://brain.example.com'
    }
  });
  const result=await maintainer.run({mediaType:'movies',batchSize:2});
  assert.deepEqual(result,{processed:2,updated:2,failed:0,mediaType:'movies'});
  assert.equal(calls.filter(call=>call.url.includes('/rest/v1/movies?id=eq.')).length,2);
});

test('maintainer rejects malformed embedding batches without corrupting rows',async()=>{
  let updates=0;
  const fetchImpl=async(url,options={})=>{
    if(String(url).includes('/rest/v1/shows?')){
      return {ok:true,status:200,json:async()=>[
        {id:'s1',title:'Dark',first_release_year:2017,description:'Mystery series'}
      ]};
    }
    if(String(url)==='https://brain.example.com/embed-texts'){
      return {ok:true,status:200,json:async()=>({embeddings:[[.1,.2]],dimensions:2,model:'bad'})};
    }
    if(String(url).includes('/rest/v1/shows?id=eq.')) updates+=1;
    return {ok:true,status:204,json:async()=>({})};
  };
  const maintainer=createCatalogEmbeddingMaintainer({
    fetchImpl,
    env:{
      SUPABASE_URL:'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'secret',
      PYTHON_BRAIN_URL:'https://brain.example.com'
    }
  });
  const result=await maintainer.run({mediaType:'shows',batchSize:1});
  assert.deepEqual(result,{processed:1,updated:0,failed:1,mediaType:'shows'});
  assert.equal(updates,0);
});
