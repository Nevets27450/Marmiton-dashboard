import type powerbi from 'powerbi-visuals-api';

export interface CachedSession { token: string; conversationId: string | null; expiresAt: number; connectDeadline: number; }
const key = 'marmiton.assistant.https.session.v1';
function valid(value: CachedSession | null): value is CachedSession {
  return !!value && /^[a-f0-9]{64}$/.test(value.token) && Number.isFinite(value.expiresAt) && value.expiresAt > Date.now()
    && Number.isFinite(value.connectDeadline) && (value.conversationId === null || /^[a-f0-9-]{36}$/i.test(value.conversationId));
}
// Use only the host's user-isolated storage, never report properties, DOM
// localStorage, cookies, or the Microsoft access token. The server validates
// this revocable visual credential whenever it is restored.
export class SessionCache {
  available = false;
  private checked: Promise<boolean>;
  private last = '';
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private storage?: powerbi.extensibility.IVisualLocalStorageV2Service) {
    this.checked = storage ? Promise.resolve().then(() => storage.status()).then(status => this.available = status === 0).catch(() => false) : Promise.resolve(false);
  }
  async load(): Promise<CachedSession | null> {
    try {
      if (await this.checked) {
        const value = JSON.parse(await Promise.resolve(this.storage!.get(key))) as CachedSession;
        if (valid(value)) { this.last = JSON.stringify(value); return { ...value }; }
        await this.clear();
      }
    } catch { /* Missing, disabled or unavailable storage never blocks login. */ }
    return null;
  }
  async save(value: CachedSession): Promise<void> {
    if (!valid(value)) return;
    const text = JSON.stringify(value); if (text === this.last) return; this.last = text;
    this.queue = this.queue.then(async () => {
      if (await this.checked) { const result = await Promise.resolve(this.storage!.set(key, text)); if (!result.success) this.available = false; }
    }).catch(() => { this.available = false; });
    await this.queue;
  }
  async clear(): Promise<void> {
    this.last = '';
    this.queue = this.queue.then(async () => { if (await this.checked) this.storage!.remove(key); }).catch(() => undefined);
    await this.queue;
  }
}
