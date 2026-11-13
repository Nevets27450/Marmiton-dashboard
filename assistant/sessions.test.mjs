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

test('automatic linking uses separate one-time approval tickets and revokes all visual access on logout', () => {
  const sessions = new Sessions(() => ({ logout() {} })); const a = sessions.create(), b = sessions.create();
  const connection = sessions.createConnection();
  assert.notEqual(connection.ticket, connection.token); assert.equal(sessions.get(connection.ticket, true), null);
  assert.equal(sessions.get(connection.token, true), null); assert.equal(sessions.pendingConnection(connection.token), true);
  sessions.approveConnection(connection.ticket, a);
  assert.equal(sessions.get(connection.token, true), a); assert.equal(sessions.pendingConnection(connection.token), false);
  assert.throws(() => sessions.approveConnection(connection.ticket, b), /expirée|utilisée/);
  assert.equal(sessions.get(connection.token, true), a);
  sessions.rotatePairing(a); assert.equal(sessions.get(connection.token, true), null);
});

test('unused connection tickets expire without granting access', () => {
  let now = 1; const sessions = new Sessions(() => ({ logout() {} }), { now: () => now });
  const a = sessions.create(), connection = sessions.createConnection(); now += 600001;
  assert.equal(sessions.pendingConnection(connection.token), false);
  assert.throws(() => sessions.approveConnection(connection.ticket, a), /expirée/);
  assert.equal(sessions.get(connection.token, true), null);
});
