const $ = id => document.getElementById(id);
const session = document.querySelector('meta[name="marmiton-session"]').content;
const ticket = new URLSearchParams(location.hash.slice(1)).get('ticket');
// The one-time approval ticket stays out of HTTP logs and browser history.
history.replaceState(null, '', '/connect');
let timer;
async function api(route, data) {
  const response = await fetch('/api/' + route, { method: data === undefined ? 'GET' : 'POST', headers: { 'x-marmiton-session': session, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Connexion indisponible.'); return result;
}
function connected() {
  clearInterval(timer); $('microsoft').hidden = true; $('approve').hidden = true;
  $('disconnect').hidden = false;
  $('link-status').textContent = 'Votre rapport est connecté à Power BI.';
  $('link-help').textContent = 'Vous pouvez fermer cet onglet et revenir au rapport. Le chat s’active automatiquement.';
}
async function poll() {
  try {
    const status = await api('status'); if (status.connected) return connected();
    if (!status.pending) { clearInterval(timer); $('approve').disabled = false; $('approve').textContent = 'Réessayer la connexion Microsoft'; $('link-status').textContent = status.message || 'La connexion Microsoft doit être validée.'; }
  } catch (e) { clearInterval(timer); $('approve').disabled = false; $('link-status').textContent = e.message; }
}
let approved = false;
$('disconnect').onclick = async () => {
  $('disconnect').disabled = true;
  try {
    await api('auth/logout', {}); $('disconnect').hidden = true;
    $('link-status').textContent = 'Vous êtes déconnecté.';
    $('link-help').textContent = 'Pour reprendre, cliquez sur Se connecter dans votre rapport.';
  } catch (e) { $('link-status').textContent = e.message; }
  finally { $('disconnect').disabled = false; }
};
if (!/^[a-f0-9]{64}$/.test(ticket || '')) { $('approve').disabled = true; $('link-status').textContent = 'Ouvrez cette page avec le bouton Se connecter du rapport.'; }
$('approve').onclick = async () => {
  $('approve').disabled = true;
  try {
    if (!approved) { await api('visual/approve', { ticket }); approved = true; }
    const status = await api('status'); if (status.connected) return connected();
    const auth = await api('auth/start', {}); const url = new URL(auth.url);
    if (url.protocol !== 'https:' || !['microsoft.com', 'www.microsoft.com', 'login.microsoft.com', 'login.microsoftonline.com'].includes(url.hostname)) throw new Error('Adresse Microsoft inattendue.');
    $('login-code').textContent = auth.code; $('login-link').href = url.href; $('microsoft').hidden = false;
    $('link-status').textContent = 'En attente de votre validation Microsoft…'; timer = setInterval(poll, 3000);
  } catch (e) { $('approve').disabled = false; $('link-status').textContent = e.message; }
};
