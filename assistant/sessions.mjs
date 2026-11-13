import { randomBytes } from 'node:crypto';
import { ConversationStore } from './conversation.mjs';

export class Sessions {
  constructor(makePowerBI, { ttl = 8 * 60 * 60 * 1000, max = 128, now = Date.now } = {}) {
    this.makePowerBI = makePowerBI; this.ttl = ttl; this.max = max; this.now = now;
    this.items = new Map(); this.pairings = new Map(); this.connections = new Map(); this.tickets = new Map();
  }
  prune() {
    for (const [key, value] of this.items) if (value.expiresAt <= this.now() && !value.chatBusy) {
      value.powerbi.logout(); value.conversations.clear();
      for (const [token, id] of this.pairings) if (id === key) this.pairings.delete(token);
      this.items.delete(key);
    }
    for (const [token, connection] of this.connections) if (connection.expiresAt <= this.now()) {
      this.tickets.delete(connection.ticket); this.connections.delete(token);
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
    for (const [token, id] of this.pairings) if (id === session.id) this.pairings.delete(token);
    session.pairing = randomBytes(32).toString('hex'); this.pairings.set(session.pairing, session.id);
  }
  createConnection() {
    this.prune(); if (this.connections.size >= this.max) throw new Error('Trop de connexions en attente. Réessaie plus tard.');
    const token = randomBytes(32).toString('hex'), ticket = randomBytes(32).toString('hex');
    const connection = { token, ticket, expiresAt: this.now() + 10 * 60 * 1000 };
    this.connections.set(token, connection); this.tickets.set(ticket, token); return connection;
  }
  pendingConnection(token) { this.prune(); return this.connections.has(token); }
  approveConnection(ticket, session) {
    this.prune();
    const token = this.tickets.get(ticket), connection = this.connections.get(token);
    if (!connection || this.get(session.id) !== session) throw new Error('Cette demande de connexion est expirée ou déjà utilisée. Relance Se connecter dans le rapport.');
    this.pairings.set(token, session.id); this.connections.delete(token); this.tickets.delete(ticket);
  }
}
