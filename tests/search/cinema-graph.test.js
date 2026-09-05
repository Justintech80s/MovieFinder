import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphStore } from '../../lib/search/graph-store.js';
import { extractCinemaConcepts, scoreCinemaRelations } from '../../lib/search/cinema-graph.js';

test('deduplicates nodes and edges and explains a path', () => {
  const graph = createGraphStore();
  graph.addNode({ id: 'person:gene-hackman', type: 'Person', name: 'Gene Hackman' });
  graph.addNode({ id: 'movie:conversation', type: 'Movie', title: 'The Conversation' });
  graph.addNode({ id: 'movie:conversation', type: 'Movie', title: 'The Conversation' });
  graph.addEdge({ from: 'person:gene-hackman', to: 'movie:conversation', type: 'ACTED_IN' });
  graph.addEdge({ from: 'person:gene-hackman', to: 'movie:conversation', type: 'ACTED_IN' });
  assert.equal(graph.nodes().length, 2);
  assert.equal(graph.edges().length, 1);
  assert.deepEqual(graph.explainPath('person:gene-hackman', 'movie:conversation'), {
    nodes: ['person:gene-hackman', 'movie:conversation'], edges: ['ACTED_IN']
  });
});

test('bounds traversal and returns empty for unknown nodes', () => {
  const graph = createGraphStore();
  graph.addNode({ id: 'a', type: 'Movie' });
  graph.addNode({ id: 'b', type: 'Genre' });
  graph.addEdge({ from: 'a', to: 'b', type: 'HAS_GENRE' });
  assert.equal(graph.traverse('a', { maxDepth: 1 }).length, 1);
  assert.deepEqual(graph.traverse('missing'), []);
});

test('legacy cinema concept scoring remains available', () => {
  assert.deepEqual(extractCinemaConcepts('gritty New Hollywood crime'), ['new hollywood', 'gritty']);
  const result = scoreCinemaRelations({ title: 'X', genres: ['crime'], tags: ['gritty'] }, { raw: 'gritty' });
  assert.ok(result.score > 0);
});


test('discovery concepts expand heist and car vocabulary for relation scoring',()=>{
  assert.deepEqual(extractCinemaConcepts('best heist films'),['heist']);
  assert.deepEqual(extractCinemaConcepts('car films'),['car']);
  const heist=scoreCinemaRelations(
    {title:'X',description:'A crew plans a bank robbery and getaway',genres:['crime'],tags:['caper']},
    {raw:'best heist films',concepts:['heist']}
  );
  const car=scoreCinemaRelations(
    {title:'Y',description:'Street racing and spectacular car chases',genres:['action'],tags:['automotive']},
    {raw:'car films',concepts:['car']}
  );
  assert.ok(heist.score>0);
  assert.ok(car.score>0);
});
