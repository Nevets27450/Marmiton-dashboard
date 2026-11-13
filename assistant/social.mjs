// Only whole, unambiguous social messages bypass planning. Mixed messages such
// as "Merci, et sans note ?" must still reach the analytical planner.
export function socialPlan(question) {
  if (typeof question !== 'string') return null;
  const text = question.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[’']/g, ' ').replace(/[.!?,;:…👍😊🙏👋]/gu, ' ').replace(/\s+/g, ' ').trim();
  let answer;
  if (/^(?:merci(?: beaucoup| bien| infiniment)?(?: pour (?:ces|les|tes|vos) (?:infos|informations|explications|reponses|precisions))?(?: a toi)?|je te remercie)(?: c est (?:clair|parfait|super))?$/.test(text)) answer = 'Avec plaisir !';
  else if (/^(?:ok(?:ay)?|d accord|entendu|compris|c est (?:bon|clair|parfait)|parfait|super|genial|tres bien|ca marche)(?: merci(?: beaucoup)?)?$/.test(text)) answer = 'Très bien !';
  else if (/^(?:bonjour|bonsoir|salut|hello|coucou)(?: a toi)?$/.test(text)) answer = 'Bonjour ! Que souhaites-tu explorer dans les données Marmiton ?';
  else if (/^(?:au revoir|a bientot|bonne journee|bonne soiree|a plus)(?: et merci)?$/.test(text)) answer = 'À bientôt !';
  else if (/^(?:comment (?:vas tu|allez vous)|ca va)(?: et toi)?$/.test(text)) answer = 'Je suis prêt à t’aider à explorer les données Marmiton !';
  if (!answer) return null;
  return { operation: 'conversation', note: 'all', rating: null, minMinutes: null, maxMinutes: null, ingredient: null, limit: 5, clarification: answer };
}
