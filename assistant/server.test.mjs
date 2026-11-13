import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { request as httpRequest } from 'node:http';

test('Desktop pairing requires a secret, limits opaque-origin CORS and preserves browser protection', async () => {
  const reservation = net.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['server.mjs'], { cwd: import.meta.dirname, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([
      new Promise((resolve, reject) => { child.stdout.on('data', chunk => { if (chunk.toString().includes('Marmiton Assistant')) resolve(); }); child.once('error', reject); child.once('exit', code => reject(new Error('Server exited: ' + code))); }),
      new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Server startup timeout')), 10000); timer.unref(); })
    ]);
    const base = `http://127.0.0.1:${port}`;
    const html = await (await fetch(base)).text();
    const session = html.match(/name="marmiton-session" content="([a-f0-9]+)"/)[1];
    let response = await fetch(base + '/api/status', { headers: { Origin: 'null' } });
    assert.equal(response.status, 403);
    response = await fetch(base + '/api/visual/pairing', { headers: { 'x-marmiton-session': session, Origin: base } });
    assert.equal(response.status, 200); const { code } = await response.json(); assert.match(code, /^[a-f0-9]{64}$/);
    response = await fetch(base + '/api/status', { headers: { Origin: 'null', 'x-marmiton-visual': code } });
    assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-origin'), 'null');
    assert.equal((await response.json()).connected, false);
    response = await fetch(base + '/api/status', { headers: { Origin: 'https://untrusted.example', 'x-marmiton-visual': code } });
    assert.equal(response.status, 403); assert.equal(response.headers.get('access-control-allow-origin'), null);
    response = await fetch(base + '/api/visual/pairing', { headers: { Origin: 'null', 'x-marmiton-visual': code } });
    assert.equal(response.status, 403);
    response = await fetch(base + '/api/status', { method: 'OPTIONS', headers: { Origin: 'null', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-marmiton-visual' } });
    assert.equal(response.status, 204);
    response = await fetch(base + '/api/status', { method: 'OPTIONS', headers: { Origin: 'null', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-marmiton-session' } });
    assert.equal(response.status, 403);
    response = await fetch(base + '/api/chat', { method: 'POST', headers: { Origin: 'null', 'Content-Type': 'application/json', 'x-marmiton-visual': code }, body: JSON.stringify({ question: 'test' }) });
    assert.equal(response.status, 401); // Valid pairing still requires Microsoft login.
    response = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Origin: 'null', 'Content-Type': 'application/json', 'x-marmiton-visual': code }, body: '{}' });
    assert.equal(response.status, 403);
    response = await fetch(base + '/api/visual/connect', { method: 'POST', headers: { Origin: 'null', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 201); const connection = await response.json();
    assert.equal(response.headers.get('access-control-allow-origin'), 'null');
    const authorization = new URL(connection.authorizationUrl); assert.equal(authorization.pathname, '/connect'); assert.equal(authorization.search, '');
    assert.equal(connection.authorizationUrl.includes(connection.visualToken), false);
    const ticket = new URLSearchParams(authorization.hash.slice(1)).get('ticket');
    response = await fetch(base + '/api/status', { headers: { Origin: 'null', 'x-marmiton-visual': connection.visualToken } });
    assert.equal((await response.json()).awaitingApproval, true);
    response = await fetch(base + '/api/chat', { method: 'POST', headers: { Origin: 'null', 'Content-Type': 'application/json', 'x-marmiton-visual': connection.visualToken }, body: '{}' }); assert.equal(response.status, 403);
    response = await fetch(base + '/api/visual/approve', { method: 'POST', headers: { Origin: 'null', 'Content-Type': 'application/json', 'x-marmiton-visual': connection.visualToken }, body: JSON.stringify({ ticket }) }); assert.equal(response.status, 403);
    response = await fetch(base + '/api/visual/approve', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', 'x-marmiton-session': session }, body: JSON.stringify({ ticket }) }); assert.equal(response.status, 200);
    response = await fetch(base + '/api/status', { headers: { Origin: 'null', 'x-marmiton-visual': connection.visualToken } });
    assert.equal(response.status, 200); const linkedStatus = await response.json(); assert.equal(linkedStatus.awaitingApproval, undefined); assert.equal(linkedStatus.connected, false);
    response = await fetch(base + '/api/visual/approve', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', 'x-marmiton-session': session }, body: JSON.stringify({ ticket }) }); assert.equal(response.status, 400);
    response = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', 'x-marmiton-session': session }, body: '{}' }); assert.equal(response.status, 200);
    response = await fetch(base + '/api/status', { headers: { Origin: 'null', 'x-marmiton-visual': connection.visualToken } }); assert.equal(response.status, 403);
  } finally {
    if (child.exitCode === null) { const ended = once(child, 'exit'); child.kill(); await ended; }
  }
});

test('hosted mode uses HTTPS browser cookies and never shares browser sessions', async () => {
  const reservation = net.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['server.mjs'], { cwd: import.meta.dirname, env: { ...process.env, PORT: String(port), APP_MODE: 'hosted', APP_ORIGIN: 'https://marmiton.example' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([
      new Promise((resolve, reject) => { child.stdout.on('data', chunk => { if (chunk.toString().includes('Marmiton Assistant')) resolve(); }); child.once('error', reject); child.once('exit', code => reject(new Error('Server exited: ' + code))); }),
      new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Server startup timeout')), 10000); timer.unref(); })
    ]);
    const base = `http://127.0.0.1:${port}`, host = { Host: 'marmiton.example' };
    // Node fetch rewrites Host; raw HTTP simulates the HTTPS reverse proxy.
    const proxyFetch = (url, options = {}) => new Promise((resolve, reject) => {
      const request = httpRequest(url, { method: 'GET', headers: options.headers }, response => {
        const chunks = []; response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value])) })));
      }); request.on('error', reject); request.end();
    });
    const first = await proxyFetch(base, { headers: host }); assert.equal(first.status, 200);
    const cookie = first.headers.get('set-cookie'); assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Lax/);
    const token = html => html.match(/name="marmiton-session" content="([a-f0-9]+)"/)[1];
    const a = token(await first.text());
    const b = token(await (await proxyFetch(base, { headers: host })).text()); assert.notEqual(a, b);
    const again = await proxyFetch(base, { headers: { ...host, Cookie: cookie.split(';')[0] } }); assert.equal(token(await again.text()), a);
    const pairing = async session => (await (await proxyFetch(base + '/api/visual/pairing', { headers: { ...host, Origin: 'https://marmiton.example', 'x-marmiton-session': session } })).json()).code;
    assert.notEqual(await pairing(a), await pairing(b));
    const wrongOrigin = await proxyFetch(base + '/api/status', { headers: { ...host, Origin: 'https://evil.example', 'x-marmiton-session': a } }); assert.equal(wrongOrigin.status, 403);
    assert.equal((await proxyFetch(base + '/healthz', { headers: host })).status, 200);
  } finally {
    if (child.exitCode === null) { const ended = once(child, 'exit'); child.kill(); await ended; }
  }
});
