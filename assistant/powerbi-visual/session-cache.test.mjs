import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function cacheClass() {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(new URL('./src/session-cache.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(compiled, { exports }); return exports.SessionCache;
}
test('session restoration respects storage restrictions and rejects expired credentials', async () => {
  const SessionCache = cacheClass(); let reads = 0, writes = 0;
  const blocked = new SessionCache({ status: async () => 3, get: async () => { reads++; }, set: async () => { writes++; } });
  const record = { token: 'a'.repeat(64), conversationId: null, expiresAt: Date.now() + 60000, connectDeadline: 0 };
  assert.equal(await blocked.load(), null); await blocked.save(record); assert.equal(reads, 0); assert.equal(writes, 0);
  let removed = false;
  const expired = new SessionCache({ status: async () => 0, get: async () => JSON.stringify({ ...record, expiresAt: Date.now() - 1 }), remove: () => { removed = true; } });
  assert.equal(await expired.load(), null); assert.equal(removed, true);
  const failed = new SessionCache({ status: () => { throw Error('Unavailable'); } }); assert.equal(await failed.load(), null);
});
