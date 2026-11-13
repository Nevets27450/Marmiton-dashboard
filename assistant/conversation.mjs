import { randomUUID } from 'node:crypto';
import { buildQuery, scopeLabel, answerFromRows, clarificationAnswer } from './queries.mjs';

export class ConversationStore {
  constructor() { this.items = new Map(); }
  get(id) {
    if (id && !/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Conversation invalide.');
    if (id && !this.items.has(id)) throw new Error('Conversation expirée. Clique sur Nouvelle conversation.');
    if (!id) {
      if (this.items.size >= 24) this.items.delete(this.items.keys().next().value);
      id = randomUUID(); this.items.set(id, []);
    }
    return { id, turns: this.items.get(id) };
  }
  remove(id) { this.items.delete(id); }
  clear() { this.items.clear(); }
}
export async function* runConversation({ question, conversation, planner, responder, powerbi, signal }) {
  if (typeof question !== 'string' || !question.trim() || question.length > 2000) throw new Error('La question doit contenir entre 1 et 2 000 caractères.');
  const history = conversation.turns;
  const check = () => signal?.throwIfAborted();
  check();
  yield { type: 'conversation', id: conversation.id };
  yield { type: 'status', text: history.length ? 'Lecture de votre question et du contexte…' : 'Lecture de votre question…' };
  const plan = await planner(question, history, signal); check();
  const query = buildQuery(plan);
  let rows = []; let answer; let scope = 'Aucun calcul effectué'; let warning;
  if (!query) {
    answer = clarificationAnswer(plan);
    yield { type: 'delta', text: answer };
  } else {
    yield { type: 'status', text: 'Calcul dans le modèle Power BI…' };
    rows = await powerbi.execute(query, signal); check();
    scope = scopeLabel(plan);
    yield { type: 'result', rows, scope, query, calculatedAt: new Date().toISOString() };
    yield { type: 'status', text: 'Rédaction de la réponse…' };
    answer = '';
    try {
      for await (const text of responder({ question, plan, rows, history, scope, signal })) { check(); answer += text; yield { type: 'delta', text }; }
    } catch (error) {
      check();
      // Replace incomplete prose, but keep independently verified figures visible.
      answer = answerFromRows(plan, rows);
      warning = 'La rédaction IA est indisponible ou incomplète. Réponse de secours calculée à partir des résultats Power BI.';
      yield { type: 'replace', text: answer };
      yield { type: 'warning', text: warning };
    }
  }
  check();
  // Social exchanges must not displace the analytical context of follow-ups.
  if (plan.operation !== 'conversation') history.push({ question, plan, rows, answer: answer.slice(0, 4000) });
  if (history.length > 6) history.splice(0, history.length - 6);
  yield { type: 'done', conversationId: conversation.id, answer, scope, warning };
}
