import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const config=JSON.parse(await readFile(new URL('../../vercel.json',import.meta.url),'utf8'));

test('Vercel Hobby-compatible cron schedules never run more than once per day',()=>{
  for(const cron of config.crons||[]){
    const parts=String(cron.schedule||'').trim().split(/\s+/);
    assert.equal(parts.length,5,`invalid cron schedule for ${cron.path}`);
    const [minute,hour]=parts;
    const runsMultipleTimesPerDay = minute==='*' || minute.includes('/') || hour==='*' || hour.includes('/') || hour.includes(',') || hour.includes('-');
    assert.equal(runsMultipleTimesPerDay,false,`${cron.path} runs more than once per day on Vercel Hobby: ${cron.schedule}`);
  }
});
