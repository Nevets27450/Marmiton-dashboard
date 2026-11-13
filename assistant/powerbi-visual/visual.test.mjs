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
  const calls = []; const exported = {};
  const context = { exports: exported, require: () => ({}), document: { createElement: tag => new Element(tag) }, AbortController, TextDecoder,
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/status')) return Response.json({ connected: true, llmConfigured: true });
      return new Response('data: {"type":"delta","text":"Avec plaisir !"}\n\ndata: {"type":"done"}\n\n');
    }
  };
  vm.runInNewContext(compiled, context);
  const container = new Element('div');
  const visual = new exported.Visual({ element: container, host: { launchUrl() {}, eventService: { renderingStarted() {}, renderingFinished() {} } } });
  const nodes = walk(container);
  assert.equal(nodes.some(n => n.tagName === 'form'), false);
  nodes.find(n => n.type === 'password').value = 'a'.repeat(64);
  await nodes.find(n => n.textContent === 'Connecter le chat').onclick();
  const send = nodes.find(n => n.textContent === 'Envoyer ↑'); assert.equal(send.type, 'button'); assert.equal(send.disabled, false);
  const input = nodes.find(n => n.tagName === 'textarea'); input.value = 'merci';
  send.onclick();
  for (let i = 0; i < 20 && send.disabled; i++) await new Promise(resolve => setTimeout(resolve, 5));
  const request = calls.find(call => call.url.endsWith('/chat')); assert.ok(request);
  assert.equal(JSON.parse(request.options.body).question, 'merci'); assert.equal(send.disabled, false);
  assert.ok(walk(container).some(n => n.textContent === 'Avec plaisir !'));
  visual.destroy();
});
