import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuery, validatePlan, answerFromRows } from './queries.mjs';
import { createPlanner } from './providers.mjs';
import { PowerBI } from './powerbi.mjs';

const plan = overrides => ({ operation: 'count', note: 'all', rating: null, minMinutes: null, maxMinutes: null, ingredient: null, limit: 5, clarification: '', ...overrides });
test('rejects injected operations and invalid parameter types', () => {
  assert.throws(() => validatePlan(plan({ operation: 'execute_dax', query: 'DELETE' })));
  assert.throws(() => validatePlan(plan({ maxMinutes: '30); DELETE' })));
  assert.throws(() => validatePlan(plan({ minMinutes: 40, maxMinutes: 10 })));
  assert.throws(() => validatePlan(plan({ note: 'exact', rating: null })));
});
test('ingredient literals are escaped, numerator counts recipe IDs, denominator ignores filters', () => {
  const query = buildQuery(plan({ operation: 'ingredient_presence', ingredient: 'beurre"), REMOVEFILTERS()' }));
  assert.ok(query.includes('"beurre""), REMOVEFILTERS()"'));
  assert.ok(query.includes('TREATAS(CALCULATETABLE(VALUES(recipe_ingredients[recipe_id])'));
  assert.ok(query.includes('CALCULATE(DISTINCTCOUNT(recipes[recipe_id]), REMOVEFILTERS())'));
});
test('blank notes, duration constraints and zero results remain explicit', () => {
  const p = plan({ note: 'unrated', maxMinutes: 29 });
  const query = buildQuery(p);
  assert.ok(query.includes('ISBLANK(recipes[rating_value])'));
  assert.ok(query.includes('recipes[total_time_min] <= 29'));
  assert.match(answerFromRows(p, [{ '[Recettes]': 0, '[TotalModele]': 43421, '[Part]': 0 }]), /0 recettes/);
});
test('top ingredients uses distinct recipes and enforces a bounded limit', () => {
  assert.ok(buildQuery(plan({ operation: 'top_ingredients' })).includes('DISTINCTCOUNT(recipe_ingredients[recipe_id])'));
  assert.ok(buildQuery(plan({ operation: 'top_ingredients' })).endsWith('ORDER BY [Recettes] DESC, recipe_ingredients[ingredient_name_norm_simple] ASC'));
  assert.ok(buildQuery(plan({ operation: 'top_recipes' })).endsWith('ORDER BY [Score] DESC, recipes[recipe_id] ASC'));
  assert.throws(() => buildQuery(plan({ limit: 9999 })));
  assert.throws(() => buildQuery(plan({ operation: 'top_recipes', note: 'unrated' })));
});
test('Gemini adapter passes only question and plan schema, never a key in the URL', async () => {
  let request;
  const planner = createPlanner({ provider: 'gemini', model: 'test-model', apiKey: 'test-secret' }, async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(plan()) }] } }] }) };
  });
  assert.equal((await planner('Combien de recettes ?')).operation, 'count');
  assert.ok(!request.url.includes('test-secret'));
  assert.equal(request.options.headers['x-goog-api-key'], 'test-secret');
  assert.ok(!request.options.body.includes('test-secret'));
});
test('quota failure is surfaced without a fallback or additional request', async () => {
  let calls = 0;
  const planner = createPlanner({ apiKey: 'test' }, async () => { calls++; return { ok: false, status: 429 }; });
  await assert.rejects(planner('Combien ?'), /Quota/);
  assert.equal(calls, 1);
});
test('Power BI partial results and expired access tokens are rejected', async () => {
  const bi = new PowerBI({ dataset: 'test' }, async () => ({ ok: true, status: 200, json: async () => ({ results: [{ error: { message: 'truncated' }, tables: [{ rows: [{ count: 1 }] }] }] }) }));
  bi.auth = { accessToken: 'test', expiresAt: Date.now() + 60000 };
  await assert.rejects(bi.execute('EVALUATE ROW("x",1)'), /partiel/);
  bi.fetch = async () => ({ status: 401 });
  await assert.rejects(bi.execute('EVALUATE ROW("x",1)'), /expirée/);
  assert.equal(bi.status().connected, false);
});
