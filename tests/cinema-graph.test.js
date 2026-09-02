import test from 'node:test';
import assert from 'node:assert/strict';
import { createCinemaGraph, traverseCinemaGraph } from '../lib/search/cinema-graph.js';

test('typed cinema graph normalizes duplicate nodes and typed edges', () => {
  const graph=createCinemaGraph();
  graph.upsertNode({id:'movie:goodfellas',type:'movie',label:'Goodfellas'});
  graph.upsertNode({id:'movie:goodfellas',type:'movie',label:'Goodfellas (1990)',metadata:{year:1990}});
  graph.upsertNode({id:'person:scorsese',type:'person',label:'Martin Scorsese'});
  graph.addEdge('movie:goodfellas','person:scorsese',{type:'DIRECTED_BY',weight:.95,confidence:.99,provenance:'metadata'});
  assert.equal(graph.nodes().length,2);
  assert.equal(graph.getNode('movie:goodfellas').metadata.year,1990);
  assert.equal(graph.neighbors('movie:goodfellas',{edgeTypes:['DIRECTED_BY']}).length,1);
});

test('traversal filters relationship types', () => {
  const graph=createCinemaGraph();
  graph.upsertNode({id:'movie:a',type:'movie',label:'A'});
  graph.upsertNode({id:'person:d',type:'person',label:'Director'});
  graph.upsertNode({id:'genre:crime',type:'genre',label:'Crime'});
  graph.addEdge('movie:a','person:d',{type:'DIRECTED_BY'});
  graph.addEdge('movie:a','genre:crime',{type:'HAS_GENRE'});
  const paths=traverseCinemaGraph(graph,'movie:a',{edgeTypes:['DIRECTED_BY'],maxDepth:1});
  assert.equal(paths.length,1);
  assert.equal(paths[0].edge.type,'DIRECTED_BY');
  assert.equal(paths[0].node.id,'person:d');
});
