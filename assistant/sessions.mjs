import { randomBytes } from 'node:crypto';
import { ConversationStore } from './conversation.mjs';

export class Sessions {
  constructor(makePowerBI, { ttl = 8 * 60 * 60 * 1000, max = 128, now = Date.now } = {}) {
    this.makePowerBI = makePowerBI; this.ttl = ttl; this.max = max; this.now = now;
    this.items = new Map(); this.pairings = new Map();
  }
  prune() {
    for (const [key, value] of this.items) if (value.expiresAt <= this.now() && !value.chatBusy) {
      value.powerbi.logout(); value.conversations.clear(); this.pairings.delete(value.pairing); this.items.delete(key);
    }
  }
  get(key, visual = false) {
    this.prune();
    if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) return null;
    const session = this.items.get(visual ? this.pairings.get(key) : key);
    return session && session.expiresAt > this.now() ? session : null;
  }
  create() {
    this.prune(); if (this.items.size >= this.max) throw new Error('Trop de sessions actives. Réessaie plus tard.');
    const id = randomBytes(32).toString('hex'), pairing = randomBytes(32).toString('hex');
    const session = { id, pairing, powerbi: this.makePowerBI(), conversations: new ConversationStore(), chatBusy: false, lastChat: 0, lastAuth: 0, expiresAt: this.now() + this.ttl };
    this.items.set(id, session); this.pairings.set(pairing, id); return session;
  }
  rotatePairing(session) {
    this.pairings.delete(session.pairing); session.pairing = randomBytes(32).toString('hex'); this.pairings.set(session.pairing, session.id);
  }
}
