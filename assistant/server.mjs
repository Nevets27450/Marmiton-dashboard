import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPlanner, createResponder } from './providers.mjs';
import { PowerBI } from './powerbi.mjs';
import { buildQuery, scopeLabel, answerFromRows, clarificationAnswer } from './queries.mjs';
import { runConversation } from './conversation.mjs';
import { Sessions } from './sessions.mjs';

const directory = fileURLToPath(new URL('.', import.meta.url));
try { process.loadEnvFile(directory + '.env'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const guid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const config = { provider: process.env.LLM_PROVIDER || 'gemini', apiKey: process.env.GEMINI_API_KEY || '', model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite', ollamaModel: process.env.OLLAMA_MODEL || 'qwen3:8b', tenant: process.env.POWERBI_TENANT_ID || 'b8c19512-2aed-471d-a8d1-9b06e7da786a', client: process.env.POWERBI_CLIENT_ID || 'b3c32dc4-9186-437d-9558-b1157fcde8bf', dataset: process.env.POWERBI_DATASET_ID || '1d4485a8-e6be-4930-85f1-853348554349' };
for (const value of [config.tenant, config.client, config.dataset]) if (!guid.test(value)) throw new Error('Identifiant Microsoft invalide.');
if (!['gemini', 'ollama'].includes(config.provider)) throw new Error('LLM_PROVIDER doit être gemini ou ollama.');
const port = Number(process.env.PORT || 8787);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT invalide.');
const hosted = process.env.APP_MODE === 'hosted';
const origin = hosted ? (process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || '') : `http://127.0.0.1:${port}`;
if (hosted && (!/^https:\/\/[^/]+$/.test(origin) || new URL(origin).username || new URL(origin).password)) throw new Error('APP_ORIGIN doit être une origine HTTPS sans chemin.');
const expectedHost = new URL(origin).host;
const sessions = new Sessions(() => new PowerBI({ ...config, verifyDatasetAccess: hosted }));
const planner = createPlanner(config);
const responder = createResponder(config);
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('Content-Type JSON requis.');
  const chunks = []; let bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 16000) throw new Error('Requête trop volumineuse.'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString());
}
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (hosted) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  if (req.headers.host !== expectedHost) return json(res, 403, { error: 'Adresse du serveur invalide.' });
  const url = new URL(req.url, origin);
  if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { status: 'ok' });
  // A sandboxed Power BI visual has an opaque (null) origin. It must be
  // explicitly paired from the local browser; CORS alone never grants access.
  const visualRoute = ['/api/visual/connect', '/api/status', '/api/chat', '/api/chat/reset'].includes(url.pathname);
  const visualOrigin = req.headers.origin === 'null' && visualRoute;
  if (visualOrigin) {
    res.setHeader('Access-Control-Allow-Origin', 'null');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      const headers = (req.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(h => h.trim()).filter(Boolean);
      if (!['GET', 'POST'].includes(req.headers['access-control-request-method']) || headers.some(h => !['content-type', 'x-marmiton-visual'].includes(h))) return json(res, 403, { error: 'Prévalidation refusée.' });
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Marmiton-Visual');
      res.writeHead(204); res.end(); return;
    }
  }
  try {
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'POST' && url.pathname === '/api/visual/connect' && visualOrigin) {
        await body(req);
        const connection = sessions.createConnection();
        return json(res, 201, { visualToken: connection.token, authorizationUrl: `${origin}/connect#ticket=${connection.ticket}`, expiresIn: 600 });
      }
      const browserSession = (!req.headers.origin || req.headers.origin === origin) ? sessions.get(req.headers['x-marmiton-session']) : null;
      const visualSession = visualOrigin ? sessions.get(req.headers['x-marmiton-visual'], true) : null;
      const active = browserSession || visualSession;
      if (!active && visualOrigin && req.method === 'GET' && url.pathname === '/api/status' && sessions.pendingConnection(req.headers['x-marmiton-visual'])) return json(res, 200, { connected: false, awaitingApproval: true });
      if (!active) return json(res, 403, { error: 'Session expirée ou invalide. Clique sur Se connecter dans le rapport.' });
      const { powerbi, conversations } = active;
      if (req.method === 'POST' && url.pathname === '/api/visual/approve' && browserSession) {
        const input = await body(req); sessions.approveConnection(input.ticket, browserSession);
        return json(res, 200, { approved: true });
      }
      if (req.method === 'GET' && url.pathname === '/api/visual/pairing' && browserSession) return json(res, 200, { code: active.pairing });
      if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, { ...powerbi.status(), provider: config.provider, model: config.provider === 'gemini' ? config.model : config.ollamaModel, llmConfigured: config.provider === 'ollama' || !!config.apiKey });
      if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non autorisée.' });
      const input = await body(req);
      if (url.pathname === '/api/auth/start') {
        if (!powerbi.status().pending && Date.now() - active.lastAuth < 30000) return json(res, 429, { error: 'Patiente quelques secondes avant de relancer la connexion.' });
        active.lastAuth = Date.now(); return json(res, 200, await powerbi.startLogin());
      }
      if (url.pathname === '/api/auth/logout') { powerbi.logout(); conversations.clear(); sessions.rotatePairing(active); return json(res, 200, { connected: false }); }
      if (url.pathname === '/api/chat/reset') { if (active.chatBusy) return json(res, 409, { error: 'Arrête la réponse en cours avant de recommencer.' }); conversations.remove(input.conversationId); return json(res, 200, { reset: true }); }
      if (url.pathname === '/api/chat') {
        if (!powerbi.status().connected) return json(res, 401, { error: 'Connecte ton compte Power BI avant de poser une question.' });
        if (active.chatBusy || Date.now() - active.lastChat < 2000) return json(res, 429, { error: 'Attends la fin du calcul avant de poser une autre question.' });
        active.chatBusy = true; active.lastChat = Date.now();
        try {
          if (input.stream === true) {
            const conversation = conversations.get(input.conversationId);
            const abort = new AbortController();
            res.on('close', () => { if (!res.writableEnded) abort.abort(); });
            res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'X-Accel-Buffering': 'no' });
            res.flushHeaders();
            const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': keepalive\n\n'); }, 12000);
            const send = event => { if (!res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`); };
            try {
              for await (const event of runConversation({ question: input.question, conversation, planner, responder, powerbi, signal: abort.signal })) send(event);
            } catch (error) {
              if (!abort.signal.aborted) send({ type: 'error', text: error.name === 'TimeoutError' ? 'Le service met trop de temps à répondre.' : error instanceof SyntaxError ? 'Réponse IA invalide. Reformule ta question.' : error.name === 'TypeError' ? 'Connexion au service interrompue.' : error.message });
            } finally { clearInterval(heartbeat); if (!res.destroyed) res.end(); }
            return;
          }
          const plan = await planner(input.question);
          const query = buildQuery(plan);
          if (!query) return json(res, 200, { answer: clarificationAnswer(plan), rows: [], scope: 'Aucun calcul effectué' });
          const rows = await powerbi.execute(query);
          return json(res, 200, { answer: answerFromRows(plan, rows), rows, scope: scopeLabel(plan), denominator: 'Toutes les recettes du modèle publié ; filtres de la page Power BI non synchronisés.', query, calculatedAt: new Date().toISOString() });
        } finally { active.chatBusy = false; }
      }
      return json(res, 404, { error: 'Route inconnue.' });
    }
    if (req.method !== 'GET') return json(res, 405, { error: 'Méthode non autorisée.' });
    const files = { '/': ['index.html', 'text/html'], '/connect': ['connect.html', 'text/html'], '/connect.js': ['connect.js', 'text/javascript'], '/embed': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
    if (!files[url.pathname]) return json(res, 404, { error: 'Page inconnue.' });
    const [file, type] = files[url.pathname];
    let contents = await readFile(directory + 'public/' + file, 'utf8');
    if (file === 'index.html' || file === 'connect.html') {
      const cookie = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('marmiton-browser='))?.slice('marmiton-browser='.length);
      const browser = sessions.get(cookie) || sessions.create();
      // Lax keeps an existing session on the top-level navigation from Power BI.
      // API mutations still require the private header and matching Origin.
      res.setHeader('Set-Cookie', `marmiton-browser=${browser.id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${hosted ? '; Secure' : ''}`);
      contents = contents.replace('__SESSION__', browser.id);
      if (url.pathname === '/embed') {
        // Desktop-only integration. No wildcard and no CORS: external sites
        // cannot read local credentials or use the authenticated API.
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'self' https://app.powerbi.com https://*.powerbi.com https://*.analysis.windows.net https://*.pbi.microsoft.com; base-uri 'none'; form-action 'self'");
        contents = contents.replace('<body>', '<body class="embedded">');
      }
    }
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(contents);
  } catch (error) {
    // Never serialize upstream request objects, response bodies or credentials.
    const safe = error.name === 'TimeoutError' ? 'Le service met trop de temps à répondre. Réessaie.' : error instanceof SyntaxError ? 'Réponse structurée invalide. Reformule la question.' : error.name === 'TypeError' ? 'Connexion réseau indisponible. Vérifie la connexion au service.' : error.message;
    json(res, 400, { error: safe });
  }
});
server.requestTimeout = 15000;
server.listen(port, hosted ? '0.0.0.0' : '127.0.0.1', () => console.log(`Marmiton Assistant : ${origin}\nMode ${hosted ? 'hébergé' : 'local'}, sessions séparées. Clé Gemini ${config.apiKey ? 'configurée' : 'à renseigner'}.`));
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Le port ${port} est déjà utilisé.` : 'Impossible de démarrer le serveur local.'); process.exitCode = 1; });
