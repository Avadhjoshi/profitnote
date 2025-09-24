// Dynamic Intent Router for ProfitPhase Assistant
const { embedText, streamLLM } = require("../services/openai");

// ---------- Semantic centroid preparation ----------
const INTENT_REPRESENTATIVES = {
  "price.get": [
    "live price", "quote now", "current rate", "price update"
  ],
  "analysis.do": [
    "technical view", "trade setup", "support resistance", "target and stop",
    "is it bullish", "should I buy or sell", "intraday idea"
  ],
  "chart.get": [
    "show chart", "plot candles", "display graph"
  ],
  "smalltalk.misc": [
    "hello", "help", "thanks", "what can you do"
  ]
};

const cosine = (a,b)=>{
  let s=0,na=0,nb=0;
  for (let i=0;i<a.length;i++){ s+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; }
  return s / (Math.sqrt(na)*Math.sqrt(nb)+1e-12);
};

let _centroids = new Map();

async function buildIntentCentroids() {
  const entries = Object.entries(INTENT_REPRESENTATIVES);
  for (const [id, reps] of entries) {
    const embs = [];
    for (const r of reps) {
      const e = await embedText(r);
      embs.push(e);
    }
    const d = embs[0].length;
    const c = new Array(d).fill(0);
    for (const e of embs) for (let i=0;i<d;i++) c[i]+=e[i];
    for (let i=0;i<d;i++) c[i]/=embs.length;
    _centroids.set(id, c);
  }
}

buildIntentCentroids().catch(()=>{}); // build once at startup

const RULES = {
  price: /\b(price|quote|rate|live\s*price|current\s*(price|rate)|spot)\b/i,
  chart: /\b(chart|plot|candles?|graph)\b/i,
  analysis: /\b(analy[sz]e|analysis|setup|signal|support|resistance|levels?|target|stop\s*loss|stoploss|entry|exit|buy|sell|hold|view|outlook|breakout)\b/i,
  greeting: /^(hi|hello|hey|namaste|gm|thanks|thank\s*you|help)\b/i
};

async function routeIntentDynamic(text) {
  const t = (text||"").trim();

  // 1) Rules first
  if (RULES.greeting.test(t)) return { intent:"smalltalk.misc", confidence:0.95, via:"rule" };
  if (RULES.price.test(t) && !RULES.analysis.test(t)) return { intent:"price.get", confidence:0.9, via:"rule" };
  if (RULES.chart.test(t)) return { intent:"chart.get", confidence:0.85, via:"rule" };
  if (RULES.analysis.test(t)) return { intent:"analysis.do", confidence:0.85, via:"rule" };

  // 2) Semantic similarity
  try {
    const qEmb = await embedText(t);
    let best = { id: "smalltalk.misc", score: -1 };
    for (const [id, c] of _centroids.entries()) {
      const s = cosine(qEmb, c);
      if (s > best.score) best = { id, score: s };
    }
    if (best.score >= 0.35) return { intent: best.id, confidence: best.score, via:"semantic" };
  } catch {}

  // 3) LLM fallback
  try {
    const messages = [
      { role:"system", content: "Classify the user's request into one intent: price.get, analysis.do, chart.get, smalltalk.misc. Respond ONLY with JSON: {intent, confidence:0..1}." },
      { role:"user", content: t }
    ];
    let acc = "";
    for await (const tok of streamLLM(messages, { temperature:0, model:"gpt-4o-mini" })) acc += tok;
    const m = acc.match(/\{[\s\S]*\}/);
    const obj = m ? JSON.parse(m[0]) : null;
    if (obj?.intent) return { intent: obj.intent, confidence: obj.confidence ?? 0.5, via:"llm" };
  } catch {}

  return { intent:"analysis.do", confidence:0.3, via:"default" };
}

module.exports = { routeIntentDynamic };
