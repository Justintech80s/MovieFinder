import test from 'node:test';
import assert from 'node:assert/strict';
import { rankResults } from '../../lib/search/rank.js';

const movie=(title,overrides={})=>({
  title,
  description:'',
  genres:[],
  tags:[],
  offers:[],
  ratings:{imdb:null,rottenTomatoes:null,imdbVotes:null},
  ...overrides
});

test('best discovery ranking prefers stronger critic and audience scores',()=>{
  const ranked=rankResults([
    movie('Low',{ratings:{imdb:6.2,rottenTomatoes:61,imdbVotes:20000}}),
    movie('High',{ratings:{imdb:8.4,rottenTomatoes:94,imdbVotes:600000}})
  ],{kind:'discovery',rankingIntent:'best',concepts:[]});
  assert.equal(ranked[0].title,'High');
  assert.match(ranked[0].cinemaWhy,/best-rated signal/);
});

test('highest-rated intent prioritizes ratings more strongly than availability',()=>{
  const ranked=rankResults([
    movie('Available',{offers:[{provider:'Max',type:'FLATRATE'}],ratings:{imdb:6.5,rottenTomatoes:65,imdbVotes:50000}}),
    movie('Acclaimed',{ratings:{imdb:9.0,rottenTomatoes:97,imdbVotes:800000}})
  ],{kind:'discovery',rankingIntent:'highest-rated',concepts:[]});
  assert.equal(ranked[0].title,'Acclaimed');
});

test('underrated intent rewards strong ratings with lower vote counts',()=>{
  const ranked=rankResults([
    movie('Blockbuster',{ratings:{imdb:8.0,rottenTomatoes:88,imdbVotes:900000}}),
    movie('Hidden Gem',{ratings:{imdb:8.1,rottenTomatoes:90,imdbVotes:18000}})
  ],{kind:'discovery',rankingIntent:'underrated',concepts:[]});
  assert.equal(ranked[0].title,'Hidden Gem');
  assert.match(ranked[0].cinemaWhy,/underrated signal/);
});

test('cult intent rewards cult-tagged candidates',()=>{
  const ranked=rankResults([
    movie('Mainstream',{ratings:{imdb:8.0,rottenTomatoes:90,imdbVotes:500000}}),
    movie('Cult Pick',{tags:['cult','midnight movie'],ratings:{imdb:7.3,rottenTomatoes:82,imdbVotes:60000}})
  ],{kind:'discovery',rankingIntent:'cult',concepts:[]});
  assert.equal(ranked[0].title,'Cult Pick');
  assert.match(ranked[0].cinemaWhy,/cult signal/);
});
