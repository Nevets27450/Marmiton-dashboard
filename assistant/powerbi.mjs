export class PowerBI {
  constructor(config, fetchImpl = fetch) { this.config = config; this.fetch = fetchImpl; this.auth = null; this.pending = null; }
  status() {
    if (this.auth && this.auth.expiresAt <= Date.now()) this.auth = null;
    return { connected: !!this.auth && (!this.config.verifyDatasetAccess || this.auth.verified === true), pending: !!this.pending, message: this.lastMessage || '' };
  }
  async startLogin() {
    if (this.pending) return this.pending.public;
    const authority = `https://login.microsoftonline.com/${this.config.tenant}/oauth2/v2.0`;
    const response = await this.fetch(`${authority}/devicecode`, { method: 'POST', signal: AbortSignal.timeout(20000), body: new URLSearchParams({ client_id: this.config.client, scope: 'https://analysis.windows.net/powerbi/api/Dataset.Read.All' }) });
    if (!response.ok) throw new Error('Impossible de démarrer la connexion Microsoft. Vérifie les identifiants Entra et les flux de clients publics.');
    const device = await response.json();
    const publicInfo = { url: device.verification_uri, code: device.user_code, expiresIn: device.expires_in };
    this.pending = { public: publicInfo, cancelled: false };
    this.lastMessage = '';
    void this.poll(authority, device, this.pending);
    return publicInfo;
  }
  async poll(authority, device, pending) {
    const deadline = Date.now() + device.expires_in * 1000;
    let interval = Math.max(5, device.interval || 5);
    try {
      while (Date.now() < deadline && !pending.cancelled) {
        await new Promise(resolve => { const timer = setTimeout(resolve, interval * 1000); timer.unref?.(); });
        if (pending.cancelled) return;
        const response = await this.fetch(`${authority}/token`, { method: 'POST', signal: AbortSignal.timeout(20000), body: new URLSearchParams({ client_id: this.config.client, grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: device.device_code }) });
        const result = await response.json();
        if (response.ok) {
          if (!pending.cancelled) this.auth = { accessToken: result.access_token, expiresAt: Date.now() + Math.max(0, result.expires_in - 60) * 1000 };
          if (!pending.cancelled && this.config.verifyDatasetAccess) {
            try { await this.execute('EVALUATE ROW("Access", COUNTROWS(recipes))', undefined, true); if (!pending.cancelled && this.auth) this.auth.verified = true; }
            catch { this.auth = null; throw new Error('Accès au modèle refusé.'); }
          }
          return;
        }
        if (result.error === 'authorization_pending') continue;
        if (result.error === 'slow_down') { interval += 5; continue; }
        throw new Error('Connexion Microsoft refusée ou expirée. Relance la connexion ; un administrateur peut être nécessaire selon les règles du tenant.');
      }
      if (!pending.cancelled) this.lastMessage = 'Le code Microsoft a expiré. Relance la connexion.';
    } catch (error) { this.auth = null; this.lastMessage = error.message === 'Accès au modèle refusé.' ? 'Ton compte ne peut pas interroger ce modèle Power BI. Vérifie ses droits Lecture/Build.' : error.name === 'TimeoutError' ? 'Le service Microsoft ne répond pas.' : 'Connexion Microsoft interrompue. Vérifie les paramètres Entra et réessaie.'; }
    finally { if (this.pending === pending) this.pending = null; }
  }
  logout() { if (this.pending) this.pending.cancelled = true; this.pending = null; this.auth = null; this.lastMessage = ''; }
  async execute(query, signal, checkingAccess = false) {
    if (checkingAccess ? !this.auth : !this.status().connected) throw new Error('Connecte d’abord ton compte universitaire Power BI.');
    const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000);
    const response = await this.fetch(`https://api.powerbi.com/v1.0/myorg/datasets/${this.config.dataset}/executeQueries`, { method: 'POST', signal: requestSignal, headers: { Authorization: `Bearer ${this.auth.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ queries: [{ query }], serializerSettings: { includeNulls: true } }) });
    if (response.status === 401) { this.auth = null; throw new Error('Connexion Power BI expirée. Reconnecte-toi.'); }
    if (response.status === 403) throw new Error('Accès Power BI refusé. Vérifie les permissions Lecture/Build et le paramètre Execute Queries du tenant.');
    if (response.status === 404) throw new Error('Modèle Power BI introuvable ou inaccessible au compte connecté.');
    const result = await response.json();
    if (!response.ok || result.error || result.results?.some(r => r.error || r.tables?.some(t => t.error))) throw new Error('Power BI n’a pas pu exécuter ce calcul. Aucun résultat partiel n’est présenté.');
    const rows = result.results?.[0]?.tables?.[0]?.rows;
    if (!Array.isArray(rows)) throw new Error('Réponse Power BI inattendue.');
    return rows;
  }
}
