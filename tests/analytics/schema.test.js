import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations/20260901_anonymous_analytics.sql', 'utf8');

test('analytics migration defines privacy-first event and report-run storage', () => {
  assert.match(sql, /create table if not exists analytics_events/i);
  assert.match(sql, /event_type text not null/i);
  assert.match(sql, /visitor_key text not null/i);
  assert.match(sql, /session_key text not null/i);
  assert.match(sql, /query_text text/i);
  assert.match(sql, /provider text/i);
  assert.match(sql, /monetization_type text/i);
  assert.match(sql, /create table if not exists analytics_report_runs/i);
  assert.match(sql, /week_start date primary key/i);
  assert.match(sql, /status text not null/i);
  assert.doesNotMatch(sql, /\bip_address\b/i);
  assert.doesNotMatch(sql, /\bemail\b/i);
  assert.doesNotMatch(sql, /\bdevice_fingerprint\b/i);
});
