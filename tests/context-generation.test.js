const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('preserved sources and reviewed decisions reproduce every published annotation', () => {
  const result = spawnSync(process.execPath, ['scripts/annotate-default-examples.mjs', '--check'], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 60000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /"errors": 0/);
  assert.match(result.stdout, /"reviews": 0/);
  assert.match(result.stdout, /reproduce exactly/);
});
