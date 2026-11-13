const session = document.querySelector('meta[name="marmiton-session"]').content;
const $ = id => document.getElementById(id);
let busy = false;
let connected = false;
let ready = false;
let polling;
let conversationId = null;
let controller = null;
const hint = 'Entrée pour envoyer · Maj + Entrée pour une nouvelle ligne';
async function api(path, data) {
  const response = await fetch('/api/' + path, { method: data === undefined ? 'GET' : 'POST', headers: { 'x-marmiton-session': session, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Le service ne répond pas.');
  return result;
}
async function status() {
  try {
    const state = await api('status');
    connected = state.connected; ready = state.llmConfigured;
    $('connection').textContent = connected ? 'Power BI connecté' : state.pending ? 'Validation Microsoft en attente…' : state.message || 'Power BI non connecté';
    $('provider').textContent = ready ? '' : 'Clé Gemini à renseigner dans assistant/.env, puis redémarrer.';
    $('connect').disabled = state.pending;
    $('connect').hidden = connected;
    $('disconnect').hidden = !connected && !state.pending;
    $('disconnect').textContent = 'Se déconnecter';
    $('send').disabled = !connected || !ready || busy;
    $('new-chat').disabled = busy;
    $('disconnect').disabled = busy;
    if (!state.pending) { $('auth').hidden = true; clearInterval(polling); }
  } catch (e) { $('connection').textContent = e.message; $('send').disabled = true; }
}
$('connect').addEventListener('click', async () => {
  $('connect').disabled = true;
  try {
    const auth = await api('auth/start', {});
    const url = new URL(auth.url);
    if (url.protocol !== 'https:' || !['microsoft.com', 'login.microsoft.com', 'login.microsoftonline.com'].includes(url.hostname)) throw new Error('Adresse Microsoft inattendue.');
    $('auth-link').href = url.href;
    $('auth-code').textContent = auth.code;
    $('auth').hidden = false;
    clearInterval(polling); polling = setInterval(status, 5000);
    await status();
  } catch (e) { $('connection').textContent = e.message; $('connect').disabled = false; }
});
$('disconnect').addEventListener('click', async () => { try { await api('auth/logout', {}); conversationId = null; $('messages').replaceChildren(); await status(); } catch (e) { $('connection').textContent = e.message; } });
window.addEventListener('focus', status);
for (const example of document.querySelectorAll('.example')) example.addEventListener('click', () => { $('question').value = example.textContent; $('question').focus(); });
function message(kind, text) {
  document.querySelector('.welcome')?.remove();
  const article = document.createElement('article'); article.className = kind;
  const heading = document.createElement('strong'); heading.textContent = kind === 'user' ? 'Vous' : 'Marmiton';
  const content = document.createElement('p'); content.textContent = text;
  content.className = 'answer-text';
  article.append(heading, content); $('messages').append(article); scrollLatest(); return article;
}
function scrollLatest(force = false) {
  const pane = $('messages');
  if (force || pane.scrollHeight - pane.scrollTop - pane.clientHeight < 180) pane.scrollTop = pane.scrollHeight;
}
const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });
function tableFor(rows) {
  if (!rows.length) return null;
  const wrapper = document.createElement('div'); wrapper.className = 'table-scroll';
  const table = document.createElement('table'); const head = document.createElement('thead'); const tr = document.createElement('tr');
  const keys = Object.keys(rows[0]).filter(k => !/Min_Borne|recipe_id/.test(k));
  for (const key of keys) { const th = document.createElement('th'); th.textContent = key.replace(/^.*\[/, '').replace(/\]$/, '').replace('ingredient_name_norm_simple', 'Ingrédient').replace('title', 'Recette').replace('Part', 'Part du total'); tr.append(th); }
  head.append(tr); table.append(head); const body = document.createElement('tbody');
  for (const row of rows) { const line = document.createElement('tr'); for (const key of keys) { const cell = document.createElement('td'); const value = row[key]; cell.textContent = value == null ? '—' : typeof value === 'number' ? key === '[Part]' ? percent.format(value) : number.format(value) : String(value); line.append(cell); } body.append(line); }
  table.append(body); wrapper.append(table); return wrapper;
}
function renderProse(target, text) {
  target.replaceChildren();
  // A tiny DOM-only formatter: never interpret model output as HTML.
  for (const line of text.split('\n')) {
    const row = document.createElement('span'); row.className = 'prose-line';
    const clean = line.replace(/^#{1,3}\s+/, '');
    for (const [index, part] of clean.split('**').entries()) { const node = document.createElement(index % 2 ? 'strong' : 'span'); node.textContent = part; row.append(node); }
    target.append(row);
  }
}
async function readEvents(response, onEvent) {
  if (!response.body) throw new Error('La réponse en direct n’est pas disponible. Redémarre le serveur.');
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let doneEvent = false;
  const frame = text => { const data = text.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n'); if (!data) return; const event = JSON.parse(data); onEvent(event); if (event.type === 'done') doneEvent = true; };
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true }); buffer = buffer.replace(/\r\n/g, '\n');
      let index; while ((index = buffer.indexOf('\n\n')) >= 0) { frame(buffer.slice(0, index)); buffer = buffer.slice(index + 2); }
    }
    buffer += decoder.decode(); if (buffer.trim()) frame(buffer);
    if (!doneEvent) throw new Error('La réponse a été interrompue. Vous pouvez réessayer.');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
$('stop').addEventListener('click', () => controller?.abort());
$('new-chat').addEventListener('click', async () => {
  if (busy) return;
  try { if (conversationId) await api('chat/reset', { conversationId }); conversationId = null; $('messages').replaceChildren(); message('assistant', 'Nouvelle conversation. Que souhaites-tu explorer dans les recettes Marmiton ?'); $('question').focus(); }
  catch (e) { $('progress').textContent = e.message; }
});
$('question').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); if (!busy && connected && ready) $('question-form').requestSubmit(); } });
$('question-form').addEventListener('submit', async event => {
  event.preventDefault(); const question = $('question').value.trim(); if (!question || busy || !connected || !ready) return;
  busy = true; controller = new AbortController(); $('send').disabled = true; $('new-chat').disabled = true; $('disconnect').disabled = true; $('stop').hidden = false; $('messages').setAttribute('aria-busy', 'true');
  message('user', question); $('question').value = ''; const article = message('assistant', ''); article.classList.add('streaming');
  const content = article.querySelector('.answer-text'); const phase = document.createElement('div'); phase.className = 'phase'; phase.textContent = 'Lecture de votre question…'; article.insertBefore(phase, content);
  let answer = ''; let receivedResult = false; let successful = false;
  const note = text => { const p = document.createElement('p'); p.className = 'response-note'; p.textContent = text; article.append(p); };
  try {
    const response = await fetch('/api/chat', { method: 'POST', signal: controller.signal, headers: { 'x-marmiton-session': session, 'Content-Type': 'application/json' }, body: JSON.stringify({ question, conversationId, stream: true }) });
    if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Le chat ne répond pas.'); }
    if (!response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('Redémarre le serveur Node pour activer la nouvelle conversation en direct.');
    await readEvents(response, result => {
      if (result.type === 'conversation') conversationId = result.id;
      if (result.type === 'status') { phase.textContent = result.text; $('progress').textContent = result.text; }
      if (result.type === 'delta' || result.type === 'replace') { answer = result.type === 'replace' ? result.text : answer + result.text; content.textContent = answer; }
      if (result.type === 'result') {
        receivedResult = true;
        const details = document.createElement('details'); details.className = 'verified';
        const summary = document.createElement('summary'); summary.textContent = 'Sources et calcul'; details.append(summary);
        const table = tableFor(result.rows); if (table) details.append(table); article.append(details);
        const scope = document.createElement('p'); scope.className = 'scope'; scope.textContent = result.scope; details.append(scope);
        const dax = document.createElement('details'); const label = document.createElement('summary'); label.textContent = 'Voir le calcul DAX'; const pre = document.createElement('pre'); pre.textContent = result.query; dax.append(label, pre); details.append(dax);
      }
      if (result.type === 'warning') note(result.text);
      if (result.type === 'error') throw new Error(result.text);
      if (result.type === 'done') { successful = true; if (!receivedResult) { const p = document.createElement('p'); p.className = 'scope'; p.textContent = result.scope; article.append(p); } }
      scrollLatest();
    });
  } catch (e) {
    note(e.name === 'AbortError' ? 'Affichage arrêté. Le contexte conserve uniquement les échanges terminés.' : e.message);
  } finally {
    phase.remove(); article.classList.remove('streaming'); renderProse(content, answer);
    if (answer) { const copy = document.createElement('button'); copy.className = 'copy secondary'; copy.textContent = 'Copier la réponse'; copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(answer); copy.textContent = 'Copié ✓'; } catch { copy.textContent = 'Sélectionnez le texte pour le copier'; } }); article.append(copy); }
    if (successful && receivedResult) { const follow = document.createElement('div'); follow.className = 'followups'; for (const text of ['Et sans note ?', 'Seulement en moins de 30 minutes ?']) { const button = document.createElement('button'); button.className = 'secondary'; button.textContent = text; button.addEventListener('click', () => { $('question').value = text; $('question').focus(); }); follow.append(button); } article.append(follow); }
    busy = false; controller = null; $('stop').hidden = true; $('messages').setAttribute('aria-busy', 'false'); $('progress').textContent = hint; await status(); $('question').focus(); scrollLatest();
  }
});
void status();
