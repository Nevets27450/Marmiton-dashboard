import powerbi from 'powerbi-visuals-api';
import '../style/visual.less';
import IVisual = powerbi.extensibility.visual.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import { SessionCache } from './session-cache';
const base = "https://marmiton-assistant.onrender.com";
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); if (text) node.textContent = text; return node;
}
export class Visual implements IVisual {
  private root = el('div'); private messages = el('div'); private state = el('span');
  private input = el('textarea'); private send = el('button', 'Envoyer ↑');
  private stop = el('button', 'Arrêter'); private connect = el('button', 'Se connecter ↗');
  private code = ''; private conversationId: string | null = null;
  private pollTimer?: ReturnType<typeof setTimeout>; private ready = false;
  private authorizationUrl = ''; private connectDeadline = 0;
  private cache: SessionCache; private expiresAt = 0; private lifecycle = 0;
  private abort?: AbortController; private busy = false; private destroyed = false;
  private events: powerbi.extensibility.IVisualEventService;
  constructor(options?: VisualConstructorOptions) {
    if (!options) throw new Error('Power BI doit initialiser le visuel.');
    this.cache = new SessionCache(options.host.storageV2Service);
    this.events = options.host.eventService; this.root.className = 'marmiton-visual';
    const toolbar = el('div'); toolbar.className = 'local-toolbar';
    this.connect.onclick = async () => {
      if (this.busy) return;
      this.lifecycle++;
      clearTimeout(this.pollTimer);
      this.connect.disabled = true; this.send.disabled = true; this.ready = false;
      this.state.textContent = 'Préparation de la connexion…';
      try {
        const connection = await this.json('visual/connect', {});
        if (this.destroyed) return;
        const url = new URL(connection.authorizationUrl);
        if (url.origin !== base || url.pathname !== '/connect' || !/^#ticket=[a-f0-9]{64}$/.test(url.hash) || !/^[a-f0-9]{64}$/.test(connection.visualToken)) throw new Error('Réponse de connexion inattendue.');
        this.code = connection.visualToken; this.authorizationUrl = url.href;
        this.connectDeadline = Date.now() + connection.expiresIn * 1000; this.conversationId = null;
        this.expiresAt = this.connectDeadline; void this.saveSession();
        this.state.textContent = 'Validez la connexion dans le navigateur…'; this.connect.textContent = 'Relancer la connexion ↗';
        options.host.launchUrl(url.href); void this.pollConnection();
      } catch (e) { this.state.textContent = (e as Error).message; }
      finally { this.connect.disabled = false; }
    };
    const reset = el('button', 'Nouvelle conversation');
    reset.onclick = async () => {
      if (this.busy) return;
      try { if (this.conversationId) await this.json('chat/reset', { conversationId: this.conversationId });
        this.conversationId = null; void this.saveSession(); this.messages.replaceChildren(); this.welcome();
      } catch (e) { this.state.textContent = (e as Error).message; }
    };
    this.state.textContent = 'Connectez votre compte pour commencer.'; toolbar.append(this.state, this.connect, reset);
    this.messages.className = 'messages'; this.messages.setAttribute('role', 'log'); this.welcome();
    const form = el('div'); form.className = 'composer';
    this.input.placeholder = 'Posez votre question sur les recettes…'; this.input.maxLength = 2000; this.input.rows = 2;
    this.input.setAttribute('aria-label', 'Votre question');
    this.input.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!this.send.disabled) void this.ask(); } };
    this.send.type = 'button'; this.send.disabled = true;
    this.send.onclick = () => { void this.ask(); };
    this.stop.type = 'button'; this.stop.hidden = true; this.stop.onclick = () => this.abort?.abort();
    const actions = el('div'); actions.className = 'actions'; actions.append(this.stop, this.send);
    form.append(this.input, actions);
    this.root.append(toolbar, this.messages, form); options.element.append(this.root);
    void this.restoreSession();
  }
  private async restoreSession(): Promise<void> {
    const generation = this.lifecycle; const saved = await this.cache.load();
    if (!saved || this.destroyed || generation !== this.lifecycle) return;
    this.code = saved.token; this.conversationId = saved.conversationId; this.expiresAt = saved.expiresAt; this.connectDeadline = saved.connectDeadline;
    this.state.textContent = 'Restauration de la connexion…'; await this.pollConnection();
  }
  private saveSession(): Promise<void> {
    return this.cache.save({ token: this.code, conversationId: this.conversationId, expiresAt: this.expiresAt, connectDeadline: this.connectDeadline });
  }
  private async pollConnection(): Promise<void> {
    clearTimeout(this.pollTimer);
    if (this.destroyed || !this.code) return;
    try {
      const status = await this.json('status'); if (this.destroyed) return;
      this.ready = !!status.connected && !!status.llmConfigured; this.send.disabled = !this.ready || this.busy;
      if (status.connected) {
        this.expiresAt = status.expiresAt || this.expiresAt || Date.now() + 60 * 60 * 1000;
        this.authorizationUrl = ''; this.connectDeadline = 0; this.connect.textContent = 'Se reconnecter ↗';
        void this.saveSession();
        if (!this.busy) this.state.textContent = status.llmConfigured ? 'Power BI connecté' : 'Le service IA n’est pas configuré.';
      } else if (!this.busy) this.state.textContent = status.awaitingApproval ? 'Autorisez la connexion dans le navigateur…' : status.pending ? 'Validation Microsoft en attente…' : status.message || 'Connectez Microsoft dans le navigateur.';
      if (!status.connected && this.connectDeadline && Date.now() > this.connectDeadline) { this.code = ''; void this.cache.clear(); throw new Error('Connexion expirée. Cliquez sur Se connecter pour réessayer.'); }
    } catch (e) { this.ready = false; this.send.disabled = true; if (!this.destroyed) this.state.textContent = (e as Error).message; }
    if (!this.destroyed && this.code) this.pollTimer = setTimeout(() => { void this.pollConnection(); }, this.ready ? 30000 : 3000);
  }
  private welcome(): void {
    const welcome = el('div'); welcome.className = 'welcome';
    welcome.append(el('h2', 'Que souhaitez-vous explorer ?'), el('p', 'Recettes, notes, durées et ingrédients.'));
    for (const text of ['Combien de recettes n’ont pas de note ?', 'Quels sont les ingrédients les plus présents ?']) {
      const button = el('button', text); button.onclick = () => { this.input.value = text; this.input.focus(); }; welcome.append(button);
    }
    this.messages.append(welcome);
  }
  private async request(route: string, data?: unknown, signal?: AbortSignal): Promise<Response> {
    const headers: Record<string, string> = { 'x-marmiton-visual': this.code };
    if (data !== undefined) headers['Content-Type'] = 'application/json';
    let response: Response;
    try { response = await fetch(base + '/api/' + route, { method: data === undefined ? 'GET' : 'POST', headers, body: data === undefined ? undefined : JSON.stringify(data), signal }); }
    catch (e) { if (signal?.aborted) throw e; throw new Error('Serveur Marmiton inaccessible. Réessayez après son réveil ou vérifiez les autorisations réseau Power BI.'); }
    if (!response.ok) {
      if ([401, 403].includes(response.status)) { this.code = ''; this.ready = false; this.authorizationUrl = ''; void this.cache.clear(); this.connect.textContent = 'Se connecter ↗'; }
      const result = await response.json(); throw new Error(result.error || 'Le serveur ne répond pas.');
    }
    return response;
  }
  private async json(route: string, data?: unknown): Promise<any> { return (await this.request(route, data)).json(); }
  private async ask(): Promise<void> {
    const question = this.input.value.trim(); if (!question || this.busy || this.send.disabled) return;
    this.busy = true; this.send.disabled = true; this.stop.hidden = false; this.input.value = '';
    this.messages.querySelector('.welcome')?.remove();
    const user = el('div', question); user.className = 'message user';
    const answer = el('div'); answer.className = 'message assistant';
    const prose = el('div'); prose.className = 'prose'; answer.append(prose); this.messages.append(user, answer);
    this.abort = new AbortController(); let text = '';
    try {
      const response = await this.request('chat', { question, conversationId: this.conversationId, stream: true }, this.abort.signal);
      if (!response.body) throw new Error('Flux indisponible.');
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
      const event = (data: any) => {
        if (data.type === 'conversation') { this.conversationId = data.id; void this.saveSession(); }
        if (data.type === 'status') this.state.textContent = data.text;
        if (data.type === 'delta') { text += data.text; prose.textContent = text; }
        if (data.type === 'replace') { text = data.text; prose.textContent = text; }
        if (data.type === 'warning') answer.append(el('small', data.text));
        if (data.type === 'error') throw new Error(data.text);
        if (data.type === 'done') this.state.textContent = 'Power BI connecté';
        if (data.type === 'result') {
          const details = el('details'); details.append(el('summary', 'Sources et calcul'), el('p', data.scope));
          const table = el('table');
          const rows = data.rows || [], keys = Array.from(new Set<string>(rows.flatMap((r: Record<string, unknown>) => Object.keys(r))));
          const header = el('tr'); for (const key of keys) header.append(el('th', key.replace(/^\[|\]$/g, ''))); table.append(header);
          for (const row of rows) { const tr = el('tr'); for (const key of keys) tr.append(el('td', row[key] == null ? '—' : String(row[key]))); table.append(tr); }
          details.append(table); answer.append(details);
        }
        this.messages.scrollTop = this.messages.scrollHeight;
      };
      try {
        while (true) {
          const { value, done } = await reader.read(); buffer += decoder.decode(value, { stream: !done });
          buffer = buffer.replace(/\r\n/g, '\n'); let boundary: number;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
            const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
            if (data) event(JSON.parse(data));
          }
          if (done) break;
        }
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    } catch (e) {
      this.state.textContent = this.abort.signal.aborted ? 'Réponse arrêtée' : (e as Error).message;
      if (!text) prose.textContent = this.state.textContent;
    } finally {
      this.busy = false; this.stop.hidden = true; if (!this.destroyed) this.send.disabled = !this.ready;
    }
  }
  public update(options: VisualUpdateOptions): void {
    this.events.renderingStarted(options); this.root.style.width = `${options.viewport.width}px`; this.root.style.height = `${options.viewport.height}px`; this.events.renderingFinished(options);
  }
  public destroy(): void { this.destroyed = true; clearTimeout(this.pollTimer); this.abort?.abort(); this.code = ''; this.authorizationUrl = ''; this.root.remove(); }
}
