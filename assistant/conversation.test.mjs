import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationStore, runConversation } from './conversation.mjs';
import { readStream, createPlanner, geminiFetch } from './providers.mjs';
import { socialPlan } from './social.mjs';
const plan = overrides => ({ operation: 'count', note: 'all', rating: null, minMinutes: null, maxMinutes: null, ingredient: null, limit: 5, clarification: '', ...overrides });
const collect = async iterable => { const events = []; for await (const e of iterable) events.push(e); return events; };

test('Gemini 503 is retried once; quota and authentication errors are never retried', async () => {
  let calls = 0, waits = 0, cancelled = false;
  const response = await geminiFetch(async () => ++calls === 1 ? { status: 503, body: { cancel: async () => { cancelled = true; } } } : { status: 200 }, 'test', {}, async ms => { assert.equal(ms, 1200); waits++; });
  assert.equal(response.status, 200); assert.equal(calls, 2); assert.equal(waits, 1); assert.equal(cancelled, true);
  for (const status of [429, 401, 403, 400, 404]) {
    calls = 0; const r = await geminiFetch(async () => { calls++; return { status }; }, 'test', {}, async () => assert.fail('No backoff for permanent/quota errors'));
    assert.equal(r.status, status); assert.equal(calls, 1);
  }
  calls = 0; const persistent = await geminiFetch(async () => { calls++; return { status: 503 }; }, 'test', {}, async () => {});
  assert.equal(persistent.status, 503); assert.equal(calls, 2);
});

test('cancelling the 503 backoff prevents another Gemini request', async () => {
  const abort = new AbortController(); let calls = 0;
  await assert.rejects(geminiFetch(async () => { calls++; return { status: 503 }; }, 'test', { signal: abort.signal }, async () => { abort.abort(); }), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('social messages skip LLM and Power BI, while mixed questions retain analytical context', async () => {
  const planner = createPlanner({}, async () => { throw new Error('Social messages must not call the LLM'); });
  const conversation = new ConversationStore().get();
  conversation.turns.push({ question: 'Moins de 30 minutes ?', plan: plan({ maxMinutes: 29 }), rows: [], answer: 'Résultat' });
  for (const question of ['ok', 'Merci pour ces informations', 'Merci beaucoup !', 'Bonjour', 'Au revoir', 'ça marche merci']) {
    const events = await collect(runConversation({ question, conversation, planner,
      powerbi: { execute: async () => { throw new Error('No social calculation'); } },
      responder: async function* () { throw new Error('No social prose call'); } }));
    assert.equal(events.at(-1).type, 'done');
    assert.doesNotMatch(events.at(-1).answer, /count|unsupported|précis|reformul/i);
    assert.equal(events.some(e => e.type === 'result'), false);
  }
  assert.equal(conversation.turns.length, 1); assert.equal(conversation.turns[0].plan.maxMinutes, 29);
  for (const question of ['Merci, et sans note ?', 'Bonjour, combien de recettes ?', 'ok pour les recettes avec du beurre', 'super et les ingrédients ?', 'oui', 'non']) assert.equal(socialPlan(question), null);
  const modelPlanner = createPlanner({ apiKey: 'test', model: 'test' }, async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(plan({ note: 'unrated', maxMinutes: 29 })) }] } }] }) }));
  const next = await modelPlanner('Merci, et sans note ?', conversation.turns);
  assert.equal(next.note, 'unrated'); assert.equal(next.maxMinutes, 29);
});

test('technical clarification identifiers never leak into a user-facing clarification', async () => {
  const events = await collect(runConversation({ question: 'Explique', conversation: new ConversationStore().get(), planner: async () => plan({ operation: 'unsupported', clarification: 'Utilisez count ou top_recipes.' }) }));
  assert.match(events.at(-1).answer, /recettes/); assert.doesNotMatch(events.at(-1).answer, /count|top_recipes/);
});
test('completed turns are available to follow-up planning, capped at six turns', async () => {
  const store = new ConversationStore(); const conversation = store.get();
  const queries = []; let seen;
  const planner = async (question, history) => { seen = history.length; return plan({ note: history.length ? 'unrated' : 'all', maxMinutes: 29 }); };
  const responder = async function* () { yield 'Voici '; yield 'le résultat.'; };
  const powerbi = { execute: async q => { queries.push(q); return [{ '[Recettes]': 2907, '[TotalModele]': 43421, '[Part]': 0.0669 }]; } };
  let events = await collect(runConversation({ question: 'Moins de 30 minutes ?', conversation, planner, responder, powerbi }));
  assert.equal(events.filter(e => e.type === 'delta').length, 2);
  events = await collect(runConversation({ question: 'Et sans note ?', conversation, planner, responder, powerbi }));
  assert.equal(seen, 1); assert.match(queries[1], /ISBLANK/); assert.match(queries[1], /<= 29/);
  assert.equal(events.at(-1).type, 'done');
  for (let i = 0; i < 6; i++) await collect(runConversation({ question: 'Suite', conversation, planner, responder, powerbi }));
  assert.equal(conversation.turns.length, 6);
  store.remove(conversation.id); assert.throws(() => store.get(conversation.id), /expirée/);
});
test('interrupted prose is replaced by deterministic figures on quota failure', async () => {
  const conversation = new ConversationStore().get();
  const events = await collect(runConversation({ question: 'Total ?', conversation, planner: async () => plan(), powerbi: { execute: async () => [{ '[Recettes]': 12, '[TotalModele]': 20, '[Part]': 0.6 }] }, responder: async function* () { yield 'Texte incomplet'; throw new Error('quota'); } }));
  assert.match(events.find(e => e.type === 'replace').text, /12 recettes/);
  assert.equal(events.filter(e => e.type === 'warning').length, 1);
  assert.doesNotMatch(conversation.turns[0].answer, /incomplet/);
});
test('cancellation does not commit a half-finished turn', async () => {
  const controller = new AbortController(); const conversation = new ConversationStore().get();
  await assert.rejects(collect(runConversation({ question: 'Total ?', conversation, signal: controller.signal, planner: async () => plan(), powerbi: { execute: async () => [] }, responder: async function* () { yield 'Début'; controller.abort(); yield 'suite'; } })), { name: 'AbortError' });
  assert.equal(conversation.turns.length, 0);
});
test('SSE reader preserves split accents and ignores heartbeat frames', async () => {
  const text = ': keepalive\r\n\r\ndata: {"text":"réponse"}\r\n\r\ndata: [DONE]\r\n\r\n';
  const encoded = new TextEncoder().encode(text);
  const body = async function* () { for (const byte of encoded) yield Uint8Array.of(byte); };
  assert.deepEqual(await collect(readStream(body())), [{ text: 'réponse' }]);
});
test('Gemini planning receives historical plans without client-supplied DAX', async () => {
  let request;
  const planner = createPlanner({ apiKey: 'test', model: 'test' }, async (url, options) => { request = JSON.parse(options.body); return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(plan({ note: 'unrated', maxMinutes: 29 })) }] } }] }) }; });
  const result = await planner('Et sans note ?', [{ question: 'Moins de 30 minutes ?', plan: plan({ maxMinutes: 29 }), answer: 'Résultat précédent' }]);
  assert.equal(request.contents.length, 3); assert.equal(request.contents[1].role, 'model');
  assert.ok(request.contents[1].parts[0].text.includes('maxMinutes'));
  assert.equal(result.maxMinutes, 29);
});
