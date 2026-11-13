import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

class Element {
  constructor(tagName) { this.tagName = tagName; this.children = []; this.style = {}; this.attributes = {}; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren() { this.children = []; }
  setAttribute(key, value) { this.attributes[key] = value; }
  querySelector(selector) { return walk(this).find(n => n.className === selector.slice(1)) || null; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); }
  focus() {}
}
function walk(node) { return [node, ...node.children.flatMap(walk)]; }
test('Send clicks call chat directly without relying on sandbox-blocked form submission', async () => {
  const source = readFileSync(new URL('./src/visual.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const calls = []; const exported = {}; const opened = []; const ticket = 'b'.repeat(64), visualToken = 'a'.repeat(64); let polls = 0;
  const context = { exports: exported, require: () => ({}), document: { createElement: tag => new Element(tag) }, AbortController, TextDecoder, URL, setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)), clearTimeout,
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/visual/connect')) return Response.json({ visualToken, authorizationUrl: 'https://marmiton-assistant.onrender.com/connect#ticket=' + ticket, expiresIn: 600 }, { status: 201 });
      if (url.endsWith('/status')) return Response.json(++polls === 1 ? { connected: false, awaitingApproval: true } : { connected: true, llmConfigured: true });
      return new Response('data: {"type":"delta","text":"Avec plaisir !"}\n\ndata: {"type":"done"}\n\n');
    }
  };
  vm.runInNewContext(compiled, context);
  const container = new Element('div');
  const visual = new exported.Visual({ element: container, host: { launchUrl(url) { opened.push(url); }, eventService: { renderingStarted() {}, renderingFinished() {} } } });
  const nodes = walk(container);
  assert.equal(nodes.some(n => n.tagName === 'form'), false);
  assert.equal(nodes.some(n => n.type === 'password'), false);
  await nodes.find(n => n.textContent === 'Se connecter ↗').onclick();
  assert.ok(opened[0].includes('#ticket=' + ticket)); assert.equal(opened[0].includes(visualToken), false);
  for (let i = 0; i < 20 && nodes.find(n => n.textContent === 'Envoyer ↑').disabled; i++) await new Promise(resolve => setTimeout(resolve, 5));
  const send = nodes.find(n => n.textContent === 'Envoyer ↑'); assert.equal(send.type, 'button'); assert.equal(send.disabled, false);
  assert.ok(polls >= 2, 'The visual must detect approval automatically by polling');
  const input = nodes.find(n => n.tagName === 'textarea'); input.value = 'merci';
  send.onclick();
  for (let i = 0; i < 20 && send.disabled; i++) await new Promise(resolve => setTimeout(resolve, 5));
  const request = calls.find(call => call.url.endsWith('/chat')); assert.ok(request);
  assert.equal(JSON.parse(request.options.body).question, 'merci'); assert.equal(send.disabled, false);
  assert.ok(walk(container).some(n => n.textContent === 'Avec plaisir !'));
  visual.destroy();
});
