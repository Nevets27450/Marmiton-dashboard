import test from 'node:test';
import assert from 'node:assert/strict';
import { Sessions } from './sessions.mjs';

test('browser identities, Power BI connections, conversations and pairings are isolated', () => {
  const sessions = new Sessions(() => ({ connected: false, logout() { this.connected = false; } }));
  const a = sessions.create(), b = sessions.create(); a.powerbi.connected = true;
  assert.notEqual(a.id, b.id); assert.notEqual(a.pairing, b.pairing);
  assert.equal(sessions.get(a.pairing, true), a); assert.equal(sessions.get(b.pairing, true), b);
  assert.equal(b.powerbi.connected, false); const conversation = a.conversations.get();
  assert.throws(() => b.conversations.get(conversation.id), /expirée/);
  const old = a.pairing; sessions.rotatePairing(a);
  assert.equal(sessions.get(old, true), null); assert.equal(sessions.get(a.pairing, true), a);
  assert.equal(sessions.get(b.pairing, true), b);
});
test('expired sessions revoke their pairing and Microsoft authentication', () => {
  let now = 1;
  const sessions = new Sessions(() => ({ connected: true, logout() { this.connected = false; } }), { now: () => now, ttl: 10, max: 1 });
  const session = sessions.create(); assert.throws(() => sessions.create(), /sessions actives/);
  now = 12; assert.equal(sessions.get(session.id), null); assert.equal(sessions.get(session.pairing, true), null);
  assert.equal(session.powerbi.connected, false); assert.ok(sessions.create());
});
