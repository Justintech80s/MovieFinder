import test from 'node:test';
import assert from 'node:assert/strict';
import { runPythonPersonSearch } from '../../lib/search/python-service.js';

const validPayload={
  person:{name:'Quentin Tarantino'},
  filmography:[{title:'Pulp Fiction',roles:['director','writer','cast']}],
  results:[],
  availabilitySummary:{available:0,unavailable:0,unknown:1},
  verified:true
};

async function responseWith(payload){
  return {ok:true,status:200,json:async()=>payload};
}

test('configured Python service receives person-search intent and returns its response', async () => {
  let request=null;
  const fetchImpl=async (url,options)=>{
    request={url,options};
    return responseWith(validPayload);
  };
  const result=await runPythonPersonSearch({personName:'Quentin Tarantino',role:'all',filmographyView:'available'},{serviceUrl:'https://python.example',fetchImpl});
  assert.equal(request.url,'https://python.example/person-search');
  assert.equal(request.options.method,'POST');
  assert.equal(JSON.parse(request.options.body).intent.personName,'Quentin Tarantino');
  assert.equal(result.filmography[0].title,'Pulp Fiction');
});

test('unconfigured Python service returns null so JavaScript can remain the fallback', async () => {
  let called=false;
  const result=await runPythonPersonSearch({personName:'Quentin Tarantino'},{serviceUrl:'',fetchImpl:async()=>{called=true;}});
  assert.equal(result,null);
  assert.equal(called,false);
});

test('Python service non-2xx returns null for controlled JavaScript fallback', async () => {
  const result=await runPythonPersonSearch({personName:'Quentin Tarantino'},{serviceUrl:'https://python.example',fetchImpl:async()=>({ok:false,status:503})});
  assert.equal(result,null);
});

test('Python service rejects malformed filmography payloads', async () => {
  const payload={...validPayload,filmography:{title:'Pulp Fiction'}};
  const result=await runPythonPersonSearch({personName:'Quentin Tarantino'},{serviceUrl:'https://python.example',fetchImpl:()=>responseWith(payload)});
  assert.equal(result,null);
});

test('Python service rejects payloads without availabilitySummary', async () => {
  const {availabilitySummary,...payload}=validPayload;
  const result=await runPythonPersonSearch({personName:'Quentin Tarantino'},{serviceUrl:'https://python.example',fetchImpl:()=>responseWith(payload)});
  assert.equal(result,null);
});

test('Python service rejects malformed person payloads', async () => {
  const payload={...validPayload,person:'Quentin Tarantino'};
  const result=await runPythonPersonSearch({personName:'Quentin Tarantino'},{serviceUrl:'https://python.example',fetchImpl:()=>responseWith(payload)});
  assert.equal(result,null);
});
