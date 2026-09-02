import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('npm test includes both root and nested test files',()=>{
 const pkg=JSON.parse(fs.readFileSync(new URL('../../package.json',import.meta.url),'utf8'));
 assert.match(pkg.scripts.test,/tests\/\*\.test\.js/);
 assert.match(pkg.scripts.test,/tests\/\*\*\/\*\.test\.js/);
});
