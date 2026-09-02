import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const script='scripts/vercel-ignore-build.sh';
const canonical='prj_XC7cPxwxxbcbYHUZynCkKdGNjBoL';

function run(env={}){
  return spawnSync('bash',[script],{
    cwd:process.cwd(),
    env:{...process.env,...env},
    encoding:'utf8'
  });
}

test('duplicate Vercel projects skip the build',()=>{
  const result=run({VERCEL_PROJECT_ID:'prj_duplicate'});
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(result.stdout,/skip/i);
});

test('canonical getmoviefinder project is allowed to build when no diff base is available',()=>{
  const result=run({VERCEL_PROJECT_ID:canonical,VERCEL_GIT_PREVIOUS_SHA:''});
  assert.equal(result.status,1,result.stderr||result.stdout);
  assert.match(result.stdout,/build/i);
});
