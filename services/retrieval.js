const { cosineSimilarity } = require("../utils/cosine");
const { embedText, translateToEnglish } = require("./openai");

const TOPK = parseInt(process.env.FAQ_KB_TOPK || "6", 10);
const MIN_SIM = parseFloat(process.env.FAQ_KB_MIN_SIM || "0.72");

/**
 * Normalize common speech mistakes & brand terms
 */
function normalizeText(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/\bprofit\s*face\b/g, "profitphase")
    .replace(/\bprofit\s*phase\b/g, "profitphase")
    .replace(/\btoday'?s\b/g, "today's")
    .replace(/\btwo days\b/g, "today's")
    .trim();
}

/**
 * Try FAQ/KB vector search.
 * Returns { type:'faq'|'kb', item, score } or null
 */
async function searchFaqKb(db, userTextRaw) {
  const userTextNorm = normalizeText(userTextRaw);
  const english = await translateToEnglish(userTextNorm);
  const qEmb = await embedText(english);

  // Pull a reasonable window (you can paginate or filter by updated_at if huge)
  const vectors = await db.Vector.findAll({ limit: 400, order: [['updated_at','DESC']] });

  const scored = [];
  for (const v of vectors) {
    const emb = JSON.parse(v.embedding);
    const sim = cosineSimilarity(qEmb, emb);
    scored.push({ v, sim });
  }
  scored.sort((a,b)=> b.sim - a.sim);
  const top = scored.slice(0, TOPK).filter(x => x.sim >= MIN_SIM);
  if (!top.length) return null;

  const best = top[0];
  if (best.v.type === 'faq') {
    const item = await db.Faq.findByPk(best.v.ref_id);
    if (item) return { type: 'faq', item, score: best.sim };
  } else {
    const item = await db.Knowledge.findByPk(best.v.ref_id);
    if (item) return { type: 'kb', item, score: best.sim };
  }
  return null;
}

module.exports = { searchFaqKb, normalizeText };
