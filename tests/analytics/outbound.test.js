import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutboundToken, verifyOutboundToken, trackMovieOfferUrls } from '../../lib/analytics/outbound.js';

const payload={
  destination:'https://example.com/watch',movieId:'m1',movieTitle:'The Godfather',movieYear:1972,
  provider:'Example Streamer',monetizationType:'RENT',price:3.99
};

test('signed outbound token round-trips approved metadata', () => {
  const token=createOutboundToken(payload,'outbound-secret',{nowMs:1000,ttlMs:60000});
  const decoded=verifyOutboundToken(token,'outbound-secret',{nowMs:20000});
  assert.equal(decoded.destination,'https://example.com/watch');
  assert.equal(decoded.provider,'Example Streamer');
  assert.equal(decoded.movieTitle,'The Godfather');
});

test('tampered or expired outbound tokens are rejected', () => {
  const token=createOutboundToken(payload,'outbound-secret',{nowMs:1000,ttlMs:60000});
  const [body,sig]=token.split('.');
  const tampered=`${body}.${sig.slice(0,-1)}${sig.at(-1)==='A'?'B':'A'}`;
  assert.throws(()=>verifyOutboundToken(tampered,'outbound-secret',{nowMs:20000}),/invalid/i);
  assert.throws(()=>verifyOutboundToken(token,'outbound-secret',{nowMs:70000}),/expired/i);
});

test('unsafe redirect protocols are rejected', () => {
  const token=createOutboundToken({...payload,destination:'javascript:alert(1)'},'outbound-secret',{nowMs:1000,ttlMs:60000});
  assert.throws(()=>verifyOutboundToken(token,'outbound-secret',{nowMs:2000}),/destination/i);
});

test('movie offers and best option become same-origin signed redirect URLs', () => {
  const movie={id:'m1',title:'The Godfather',year:1972,offers:[{provider:'Prime Video',type:'RENT',price:3.99,url:'https://example.com/rent'}],best:{provider:'Prime Video',type:'RENT',price:3.99,url:'https://example.com/rent'}};
  const tracked=trackMovieOfferUrls(movie,'outbound-secret',{nowMs:1000,ttlMs:60000});
  assert.match(tracked.offers[0].url,/^\/api\/out\?token=/);
  assert.match(tracked.best.url,/^\/api\/out\?token=/);
  const token=new URL(`https://moviefinder.test${tracked.offers[0].url}`).searchParams.get('token');
  const decoded=verifyOutboundToken(token,'outbound-secret',{nowMs:2000});
  assert.equal(decoded.provider,'Prime Video');
  assert.equal(decoded.destination,'https://example.com/rent');
});
