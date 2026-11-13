// Optional live Gemini check. Does not query Power BI or print credentials.
import { fileURLToPath } from 'node:url';
import { createPlanner, createResponder } from './providers.mjs';
process.loadEnvFile(fileURLToPath(new URL('.env', import.meta.url)));
const planner = createPlanner({ provider: process.env.LLM_PROVIDER || 'gemini', apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite', ollamaModel: process.env.OLLAMA_MODEL || 'qwen3:8b' });
const first = await planner('Combien de recettes prennent moins de 30 minutes ?');
const second = await planner('Et sans note ?', [{ question: 'Combien de recettes prennent moins de 30 minutes ?', plan: first, answer: '' }]);
if (first.operation !== 'count' || first.maxMinutes !== 29 || second.maxMinutes !== 29 || second.note !== 'unrated') throw new Error('Les critères de la relance ne sont pas correctement conservés.');
console.log(JSON.stringify({ first, followUp: second, contextPreserved: true }));
if (process.argv.includes('--with-response')) {
  const responder = createResponder({ provider: process.env.LLM_PROVIDER || 'gemini', apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite', ollamaModel: process.env.OLLAMA_MODEL || 'qwen3:8b' });
  let text = ''; let chunks = 0;
  for await (const chunk of responder({ question: 'Combien de recettes sans note ?', plan: { ...first, note: 'unrated', maxMinutes: null }, rows: [{ '[Recettes]': 9213, '[TotalModele]': 43421, '[Part]': 9213 / 43421 }], scope: 'Jeu de vérification : recettes sans note', history: [] })) { text += chunk; chunks++; }
  if (!text) throw new Error('Flux de rédaction vide.');
  console.log(JSON.stringify({ responseStreamVerified: true, chunks, text }));
}
