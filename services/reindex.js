const { embedText } = require("./openai");

async function embedFaq(db, faq) {
  const text = `Q: ${faq.question}\nA: ${faq.answer}`;
  const emb = await embedText(text);
  const payload = { type: 'faq', ref_id: faq.id, embedding: JSON.stringify(emb) };
  const [row] = await db.Vector.findOrCreate({ where: { type:'faq', ref_id: faq.id }, defaults: payload });
  if (row && row.embedding) {
    await db.Vector.update({ embedding: JSON.stringify(emb) }, { where: { id: row.id }});
  }
}

async function embedKb(db, kb) {
  const text = `Title: ${kb.title}\nTags: ${kb.tags}\nBody: ${kb.body}`;
  const emb = await embedText(text);
  const payload = { type: 'kb', ref_id: kb.id, embedding: JSON.stringify(emb) };
  const [row] = await db.Vector.findOrCreate({ where: { type:'kb', ref_id: kb.id }, defaults: payload });
  if (row && row.embedding) {
    await db.Vector.update({ embedding: JSON.stringify(emb) }, { where: { id: row.id }});
  }
}

async function reindexAll(db) {
  const faqs = await db.Faq.findAll();
  for (const f of faqs) { await embedFaq(db, f); }
  const kbs = await db.Knowledge.findAll();
  for (const k of kbs) { await embedKb(db, k); }
}

module.exports = { embedFaq, embedKb, reindexAll };
