/* controllers/assistantController.js
   ProfitPhase Assistant — Smart multi-asset chatbot with Image/Chart analysis
   - Dynamic detection: crypto / forex / stocks / indices / commodities
   - Source routing: Binance (crypto, REST + WS) → Yahoo Quote/Chart (equities/indices/FX/commodities)
   - Vision-first if images provided (chart reading)
   - India-compliant educational output (SEBI disclaimer / no advice)
   - SSE streaming

   ✨ Updates:
   - Much broader intent coverage (analyze/hold/buy/sell/exit/keep/should I…)
   - LLM-powered symbol extraction from sentences (“can I hold khfm?” → KHFM-SM.NS etc.)
*/
const fetch = require("node-fetch");
const axios = require("axios");
const { randomUUID } = require("crypto");
const WebSocket = require("ws");

// Your DB + services (unchanged)
const db = require("../models");
const { searchFaqKb, normalizeText } = require("../services/retrieval");
const { streamLLM, embedText } = require("../services/openai");
const { isCommonQuestion } = require("../services/classifier");
const stringSimilarity = require("string-similarity");
const { dedupe } = require("../utils/cache");


let stockCatalog = [];
let stockNames   = [];
let _binCache = { ts: 0, bases: new Set(), symbols: new Set(), quotesMap: new Map() };

/* ======================= Common-name aliases (tickers by name) ======================= */
const COMMON_NAME_MAP = new Map([
  // Crypto (name → { kind, yahoo, binance })
  ["bitcoin",   { kind: "crypto", yahoo: "BTC-USD", binance: "BTCUSDT" }],
  ["btc",       { kind: "crypto", yahoo: "BTC-USD", binance: "BTCUSDT" }],
  ["ethereum",  { kind: "crypto", yahoo: "ETH-USD", binance: "ETHUSDT" }],
  ["eth",       { kind: "crypto", yahoo: "ETH-USD", binance: "ETHUSDT" }],
  ["solana",    { kind: "crypto", yahoo: "SOL-USD", binance: "SOLUSDT" }],
  ["sol",       { kind: "crypto", yahoo: "SOL-USD", binance: "SOLUSDT" }],
  ["dogecoin",  { kind: "crypto", yahoo: "DOGE-USD", binance: "DOGEUSDT" }],
  ["doge",      { kind: "crypto", yahoo: "DOGE-USD", binance: "DOGEUSDT" }],
  ["matic",     { kind: "crypto", yahoo: "MATIC-USD", binance: "MATICUSDT" }],
  ["polygon",   { kind: "crypto", yahoo: "MATIC-USD", binance: "MATICUSDT" }],
  ["xrp",       { kind: "crypto", yahoo: "XRP-USD", binance: "XRPUSDT" }],
  ["litecoin",  { kind: "crypto", yahoo: "LTC-USD", binance: "LTCUSDT" }],
  ["ltc",       { kind: "crypto", yahoo: "LTC-USD", binance: "LTCUSDT" }],

  // Indices
  ["nifty",     { kind: "index",  yahoo: "^NSEI",    binance: null }],
  ["nifty50",   { kind: "index",  yahoo: "^NSEI",    binance: null }],
  ["sensex",    { kind: "index",  yahoo: "^BSESN",   binance: null }],
  ["banknifty", { kind: "index",  yahoo: "^NSEBANK", binance: null }],

  // Commodities
  ["gold",      { kind: "commodity", yahoo: "GC=F", binance: null }],
  ["silver",    { kind: "commodity", yahoo: "SI=F", binance: null }],
  ["crude",     { kind: "commodity", yahoo: "CL=F", binance: null }],
  ["brent",     { kind: "commodity", yahoo: "BZ=F", binance: null }],

  // FX
  ["eurusd",    { kind: "fx", yahoo: "EURUSD=X", binance: null }],
  ["usdinr",    { kind: "fx", yahoo: "USDINR=X", binance: null }],
]);
const SYMBOL_KEYS = Array.from(COMMON_NAME_MAP.keys());
// Words that may appear between an intent word and the symbol (e.g., "price **of** bitcoin")
const FILLER_TOKENS = new Set(["of","for","on","in","at","the","a","an","to","is","are","about"]);

const didYouMean = (() => {
  try {
    const mod = require("didyoumean2");
    if (typeof mod === "function") return mod;
    if (mod && typeof mod.default === "function") return mod.default;
  } catch {}
  return null; // fallback handled below
})();
async function loadIndianStocksFromDB() {
  try {
    // Pull main list
    const rows = await db.IndianEquity.findAll({
      attributes: ['symbol', 'company_name'],
      raw: true,
    });

    // Pull aliases if table exists; otherwise empty
    let aliasRows = [];
    if (db.IndianEquityAlias) {
      aliasRows = await db.IndianEquityAlias.findAll({
        attributes: ['symbol', 'alias'],
        raw: true,
      });
    }

    // Map symbol -> aliases[]
    const aliasMap = new Map();
    for (const a of aliasRows) {
      const key = String(a.symbol).toUpperCase();
      if (!aliasMap.has(key)) aliasMap.set(key, []);
      aliasMap.get(key).push(String(a.alias).trim());
    }

    // Build catalog + bag
    const bag = [];
    stockCatalog = rows.map(r => {
      const symbol = String(r.symbol).trim().toUpperCase();
      const name   = String(r.company_name || '').trim();
      const alias  = aliasMap.get(symbol) || [];

      // Add natural aliases (company_name and symbol) even if alias table is empty
      const a = Array.from(new Set([
        name,
        symbol,
        // Optional: add company name without “Ltd/Limited” etc.
        name.replace(/\b(ltd|limited|limited\.|ltd\.)\b/gi, '').trim(),
      ].concat(alias).filter(Boolean)));

      // bag entries
      bag.push(symbol.toLowerCase());
      bag.push(name.toLowerCase());
      a.forEach(x => bag.push(x.toLowerCase()));

      return { symbol, name, alias: a };
    });

    stockNames = Array.from(new Set(bag));
    console.log(`[equity-cache] loaded ${stockCatalog.length} symbols, ${stockNames.length} keys`);
  } catch (e) {
    console.error('loadIndianStocksFromDB failed:', e.message || e);
    stockCatalog = [];
    stockNames = [];
  }
}

// call once at startup
const equityCacheReady = loadIndianStocksFromDB().catch(() => {});



function findIndianStock(query, threshold = 0.7) {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  // exact match first
  const exact = stockCatalog.find(s =>
    s.symbol.toLowerCase() === q ||
    s.name.toLowerCase()   === q ||
    s.alias.some(a => a.toLowerCase() === q)
  );
  if (exact) return exact;

  // fuzzy match
  const { bestMatch } = stringSimilarity.findBestMatch(q, stockNames);
  if (bestMatch.rating < threshold) return null;

  const key = bestMatch.target;
  return stockCatalog.find(s =>
    s.symbol.toLowerCase() === key ||
    s.name.toLowerCase()   === key ||
    s.alias.some(a => a.toLowerCase() === key)
  );
}

// quick guard
const isFiller = (s="") => FILLER_TOKENS.has(String(s).toLowerCase());
// ===== Generic typo-tolerant preprocessing for chat =====

// Build a dynamic lexicon: greetings, intents, actions, timeframes, common words,
// plus *live* crypto bases and your alias keys so we don't "correct" those later.
const INTENT_WORDS = [
  "price","quote","live","current","analyze","analysis","overview","report","signal",
  "setup","chart","entry","target","hold","keep","buy","sell","exit","opinion",
  "review","outlook","support","resistance","levels","help","about","who","what",
  "how","when","why","summary","features","guide","faq","thanks","thank","please"
];
const GREETINGS = ["hi","hello","hey","yo","namaste","hola","gm","good","morning","afternoon","evening"];
const TIMEFRAMES = ["1m","2m","3m","5m","15m","30m","1h","1d","1wk","1mo","intraday","scalp","swing"];
const COMMON_CHAT = ["yes","no","okay","ok","cool","awesome","great","sure","please","sorry","explain","example","examples"];

function buildDynamicLexicon() {
  const bin = Array.from(_binCache?.bases || []);     // BTC, ETH, SOL...
  const aliasKeys = SYMBOL_KEYS || [];                 // bitcoin, eth, nifty, etc.
  return new Set([
    ...GREETINGS, ...INTENT_WORDS, ...TIMEFRAMES, ...COMMON_CHAT,
    // finance nouns
    "bitcoin","ethereum","solana","dogecoin","matic","polygon","xrp","litecoin",
    "nifty","sensex","banknifty","eurusd","usdinr",
    // dynamic (don’t correct these away)
    ...bin.map(s => s.toLowerCase()),
    ...aliasKeys.map(s => s.toLowerCase()),
  ]);
}

// Tokens we **must not** autocorrect
const PROTECT_RX = /^(?:https?:\/\/|www\.|[A-Z0-9]{2,10}(?:USDT|USD|BUSD|USDC|INR)$|[A-Z]{3}\/[A-Z]{3}$|[\^][A-Z]+|[A-Z0-9.]{2,}\.(?:NS|BO|AX|TO|L|HK|SZ|SS)$|[A-Z0-9-]+-USD$)/i;

// Split while keeping basic punctuation spacing
function simpleWords(s=""){ return s.split(/(\s+)/); }

// Autocorrect a single token if it looks like a normal word
function correctWord(word, lexiconArr) {
  const w = word.toLowerCase();
  if (!w || w.length === 1) return word;
  if (PROTECT_RX.test(word)) return word;       // protect symbols/urls/etc.
  if (/[^a-z]/i.test(w)) return word;           // skip numbers, mixed tokens
  if (lexiconArrSet.has(w)) return word;        // already known

  let guess = null;

  // Primary: didyoumean2 (if loaded)
    if (didYouMean) {
    try {
      guess = didYouMean(w, lexiconArr, { threshold: 0.72 });
    } catch (_) {
      guess = null; // fall back below
    }
   } else {
    // Fallback: string-similarity
    const { bestMatch } = stringSimilarity.findBestMatch(w, lexiconArr);
    if (bestMatch.rating >= 0.72) guess = bestMatch.target;
  }

  if (!guess) return word;
  return word[0] === word[0].toUpperCase() ? capitalize(guess) : guess;
}

function capitalize(s){ return s ? s[0].toUpperCase() + s.slice(1) : s; }

let lexiconArr = null;
let lexiconArrSet = null;

async function ensureLexiconReady() {
  // keep Binance catalog fresh so bases are current
  await refreshBinanceCatalog().catch(()=>{});
  const L = buildDynamicLexicon();
  lexiconArr = Array.from(L);
  lexiconArrSet = L;
}

// Main entry: autocorrect only chatty words, preserve finance tokens
async function autocorrectForNLP(text="") {
  await ensureLexiconReady();
  const parts = simpleWords(text);
  let changed = false;
  for (let i=0; i<parts.length; i++) {
    if (/\s+/.test(parts[i])) continue;
    const fixed = correctWord(parts[i], lexiconArr);
    if (fixed !== parts[i]) { parts[i] = fixed; changed = true; }
  }
  return { text: parts.join(""), changed };
}

function fuzzyAliasLookup(raw) {
  if (!raw) return null;
  const norm = normalizeNameKey(raw);
  const match = stringSimilarity.findBestMatch(norm, SYMBOL_KEYS);
  // accept only reasonably close matches
  if (match.bestMatch.rating >= 0.7) {
    const key = match.bestMatch.target;
    return COMMON_NAME_MAP.get(key);
  }
  return null;
}
function normalizeNameKey(s="") {
  return s.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
}
function resolveCommonAlias(raw="") {
  if (!raw) return null;
  const k = normalizeNameKey(raw);
  const hit = COMMON_NAME_MAP.get(k);
  if (hit) return { ...hit };
  // 🔥 new fuzzy fallback
  const fuzzy = fuzzyAliasLookup(raw);
  return fuzzy ? { ...fuzzy } : null;
}


// Optional lightweight NLP intent layer
const { NlpManager } = require("node-nlp"); // npm i node-nlp
let nlpManager = null;
async function initNLP() {
  if (nlpManager) return nlpManager;
  const m = new NlpManager({ languages: ["en"], forceNER: true, nlu: { useNoneFeature: false } });

// ===== INTENTS: PRICE =====
[
  "price of %symbol%",
  "live price %symbol%",
  "liveprice %symbol%",
  "quote %symbol%",
  "what is %symbol% trading at",
  "show %symbol% price",
  "how much is %symbol% now",
  "%symbol% price",
  "current %symbol%",
  "latest price of %symbol%",
  "spot price %symbol%",
  "real time price %symbol%",
  "live quote for %symbol%",
  "price for %symbol% now",
  "what's the price of %symbol%",
  "tell me price for %symbol%",
  "update price %symbol%",
  "price %symbol% today"
].forEach(p => m.addDocument("en", p, "price.get"));
[
  "what is trending now",
  "which stocks are trending",
  "trending stocks",
  "trending crypto",
  "what's trending now",
  "market movers",
  "top movers",
  "top gainers today",
  "show trending"
].forEach(p => m.addDocument("en", p, "market.trending"));
// ===== INTENTS: CHART / OVERVIEW =====
[
  "chart %symbol%",
  "show chart for %symbol%",
  "plot %symbol%",
  "plot %symbol% on 15m",
  "show %symbol% on 5m",
  "display %symbol% chart",
  "candles for %symbol%",
  "intraday chart %symbol%",
  "historical chart %symbol%",
  "overview %symbol%",
  "market overview %symbol%"
].forEach(p => m.addDocument("en", p, "chart.get"));

// ===== INTENTS: ANALYSIS / TRADE IDEA / SETUP =====
const ANALYSIS_DOCS = [
  // Generic analysis
  "analyze %symbol%",
  "analysis %symbol%",
  "technical analysis %symbol%",
  "chart analysis %symbol%",
  "technical view %symbol%",
  "market view %symbol%",
  "your view on %symbol%",
  "give view on %symbol%",
  "opinion on %symbol%",
  "review %symbol%",
  "outlook for %symbol%",
  "forecast for %symbol%",
  "prediction for %symbol%",
  "what do you think of %symbol%",
  "short term analysis for %symbol%",
  "long term analysis for %symbol%",
  "swing view on %symbol%",
  "intraday analysis for %symbol%",
  "day trade analysis for %symbol%",

  // Trade idea / setup (all the common variants)
  "trade idea %symbol%",
  "intraday trade idea %symbol%",
  "%symbol% trade idea",
  "trade setup %symbol%",
  "%symbol% trade setup",
  "give trade setup for %symbol%",
  "give me a trade setup for %symbol%",
  "give trade idea for %symbol%",
  "%symbol% intraday trade setup",
  "intraday setup for %symbol%",
  "setup for %symbol% intraday",
  "setup for %symbol% on 15m",
  "trade plan for %symbol%",
  "day trading plan for %symbol%",

  // Levels / signals
  "support for %symbol%",
  "resistance for %symbol%",
  "key levels for %symbol%",
  "levels on %symbol%",
  "breakout levels %symbol%",
  "any breakout on %symbol%",
  "is %symbol% breaking out",
  "rsi status of %symbol%",
  "momentum of %symbol%",
  "trend of %symbol%",
  "direction of %symbol%",
  "next move %symbol%",

  // Entries / exits / SL / TP (phrased as coachable analysis)
  "entry point for %symbol%",
  "best price to buy %symbol%",
  "buy zone for %symbol%",
  "target for %symbol%",
  "price target for %symbol%",
  "stop loss for %symbol%",
  "where to keep stop for %symbol%",
  "trailing stop for %symbol%",
  "risk reward for %symbol%",
  "is %symbol% bullish",
  "is %symbol% bearish",

  // Portfolio style questions (we still route to analysis.do so coach-y, no advice)
  "can i hold %symbol%",
  "should i hold %symbol%",
  "hold %symbol%",
  "should i keep %symbol%",
  "keep %symbol%",
  "exit %symbol%",
  "should i exit %symbol%",
  "when to exit %symbol%",
  "take profit on %symbol%",
  "book profit on %symbol%",
  "reduce position in %symbol%",
  "add more %symbol%",
  "is it a good time to buy %symbol%",
  "is it a good time to sell %symbol%",
  "is %symbol% undervalued",
  "is %symbol% overvalued",

  // Timeframe hints inline (captured as plain text; your parseTimeframe already maps them)
  "analyze %symbol% on 1m",
  "analyze %symbol% on 3m",
  "analyze %symbol% on 5m",
  "analyze %symbol% on 15m",
  "analyze %symbol% on 30m",
  "analyze %symbol% on 1h",
  "analyze %symbol% on 4h",
  "analyze %symbol% on 1d",
  "analysis of %symbol% intraday",
  "trade setup for %symbol% on 15m",
  "trade idea for %symbol% on 5m",
  "day trade setup for %symbol% on 15m",
  "scalping setup for %symbol% on 3m",

  // Natural language “give me … for …” patterns
  "give analysis for %symbol%",
  "give outlook for %symbol%",
  "give short term view for %symbol%",
  "give long term view for %symbol%",
  "explain setup on %symbol%",
  "explain trade idea on %symbol%"
];
ANALYSIS_DOCS.forEach(p => m.addDocument("en", p, "analysis.do"));

// ===== CONTEXT-ONLY VARIANTS (no symbol → your resolver uses conversation memory)
[
  "give trade setup",
  "give me a trade setup",
  "give trade idea",
  "trade idea please",
  "any setup",
  "any trade idea",
  "intraday trade idea",
  "intraday trade setup",
  "show levels",
  "support and resistance please",
  "short term view",
  "long term view",
  "should i hold",
  "should i exit",
  "where to keep stop",
  "what's the target"
].forEach(p => m.addDocument("en", p, "analysis.do"));

// ===== EXTRA PRICE PHRASES WITH TIME HINTS (still price.get)
[
  "price of %symbol% on 1d",
  "price of %symbol% now",
  "live price of %symbol% today",
  "current quote %symbol%",
  "real time %symbol% quote"
].forEach(p => m.addDocument("en", p, "price.get"));

  // -------- Analysis intents (broadened) --------
  const analysisPatterns = [
    "analyze %symbol%", "analysis %symbol%", "setup for %symbol%", "signal for %symbol%",
    "trade setup %symbol%", "chart analysis %symbol%", "technical view %symbol%",
    "price action %symbol%", "market view %symbol%", "future trend %symbol%",
    "is %symbol% bullish", "is %symbol% bearish", "bullish on %symbol%", "bearish on %symbol%",
    "trend of %symbol%", "direction of %symbol%", "next move %symbol%",
    "what is trend of %symbol%", "momentum of %symbol%", "strength of %symbol%",
    "can i hold %symbol%", "should i hold %symbol%", "hold %symbol%",
    "should i keep %symbol%", "keep %symbol%", "exit %symbol%",
    "should i exit %symbol%", "when to exit %symbol%", "take profit on %symbol%",
    "cut loss on %symbol%", "lock profits %symbol%",
    "can i buy %symbol%", "should i buy %symbol%", "buy %symbol%",
    "is it good to buy %symbol%", "good time to buy %symbol%", "accumulate %symbol%",
    "entry point for %symbol%", "best price to buy %symbol%", "buy zone for %symbol%",
    "add more %symbol%", "is %symbol% undervalued",
    "can i sell %symbol%", "should i sell %symbol%", "sell %symbol%",
    "good time to sell %symbol%", "target reached for %symbol%", "book profit on %symbol%",
    "reduce position in %symbol%", "is %symbol% overvalued",
    "target for %symbol%", "price target for %symbol%", "stop loss for %symbol%",
    "support for %symbol%", "resistance for %symbol%", "key levels for %symbol%",
    "next resistance of %symbol%", "next support of %symbol%", "entry exit for %symbol%",
    "opinion on %symbol%", "review %symbol%", "outlook for %symbol%",
    "forecast for %symbol%", "prediction for %symbol%", "what do you think of %symbol%",
    "fundamental view %symbol%", "investment view %symbol%", "long term view %symbol%",
    "short term view %symbol%", "swing trade on %symbol%",
    "view on %symbol%", "your view on %symbol%", "give view on %symbol%",
    "when to buy %symbol%", "when to sell %symbol%", "is it time to buy %symbol%",
    "is it time to sell %symbol%", "any breakout on %symbol%", "breakout levels %symbol%",
    "volume spike in %symbol%", "rsi status of %symbol%"
  ];
  analysisPatterns.forEach(p => m.addDocument("en", p, "analysis.do"));

  // -------- Chart/overview intents --------
  m.addDocument("en", "chart %symbol%", "chart.get");
  m.addDocument("en", "show chart for %symbol%", "chart.get");
  m.addDocument("en", "plot %symbol%", "chart.get");

  await m.train();
  nlpManager = m;
  return m;
}

/* ======================= SSE helpers ======================= */
function sseStart(res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  // NEW: heartbeat every 20s (keeps proxies/CDN happy)
  const hb = setInterval(() => {
    try { res.write(":hb\n\n"); } catch {}
  }, 20000);
  res.on("close", () => clearInterval(hb));
}
function sseData(res, chunk) { res.write(`data: ${JSON.stringify(chunk)}\n\n`); }
function sseDone(res) { res.write("data: [DONE]\n\n"); res.end(); }

/* ======================= Timeout + Retry helpers ======================= */
const UA_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};
const UA = { headers: UA_HEADERS };

function withTimeout(promise, ms = 12000) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}
async function withRetries(fn, { retries = 2, delayMs = 350 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); }
    catch (e) { lastErr = e; if (i < retries) await new Promise(r => setTimeout(r, delayMs * (i + 1))); }
  }
  throw lastErr;
}

/* ======================= Diagnostics helpers ======================= */
function errMessage(e) {
  if (!e) return "unknown_error";
  if (e.name === "AbortError") return "timeout";
  if (e.message) return String(e.message);
  return String(e);
}
function logErr(where, ctx = {}) {
  const stamp = new Date().toISOString();
  console.error(`[${stamp}] [${where}]`, JSON.stringify(ctx, null, 2));
}

/** fetch wrapper that logs non-2xx and short body for debugging */
async function fetchJsonLogged(url, init, where, opts = { bodyPreview: 400 }) {
  try {
    const r = await withTimeout(fetch(url, init), init?.timeout || 12000);
    const text = await r.text();
    if (!r.ok) {
      logErr(where, { url, status: r.status, statusText: r.statusText, body: text.slice(0, opts.bodyPreview) });
      const err = new Error(`${where}_http_${r.status}`);
      err._http = { status: r.status, url, body: text.slice(0, opts.bodyPreview) };
      throw err;
    }
    try { return JSON.parse(text); }
    catch (e) {
      logErr(where, { url, parse_error: errMessage(e), body: text.slice(0, opts.bodyPreview) });
      throw new Error(`${where}_json_parse_error`);
    }
  } catch (e) {
    logErr(where, { url, error: errMessage(e) });
    throw e;
  }
}

/* ======================= String cleanup & URL helpers ======================= */
function cleanTranscript(s = "") {
  return s
    .replace(/\bprofit\s*face\b/gi, "ProfitPhase")
    .replace(/\bprofit\s*phase\b/gi, "ProfitPhase")
    .replace(/\btoday s\b/gi, "today's")
    .replace(/\s{2,}/g, " ")
    .trim();
}
function getOrigin(req) {
  const proto = (req.headers["x-forwarded-proto"] || req.protocol).split(",")[0];
  const host  = (req.headers["x-forwarded-host"] || req.get("host"));
  return `${proto}://${host}`;
}
function absoluteUrl(req, urlLike) {
  if (!urlLike) return null;
  if (/^https?:\/\//i.test(urlLike)) return urlLike;
  const origin = getOrigin(req);
  return urlLike.startsWith("/") ? origin + urlLike : origin + "/" + urlLike;
}
function extractImageUrls(req, text = "", imagesArray = []) {
  const urls = new Set();
  (imagesArray || []).forEach(u => {
    const abs = absoluteUrl(req, u);
    if (abs) urls.add(abs);
  });
  const re = /(?:!\[[^\]]*\]\((https?:\/\/[^\s)]+)\))|((?:https?:\/\/|\b\/uploads\/)[^\s)]+?\.(?:png|jpe?g|webp|gif|svg)(?:\?[^\s)]*)?)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1] || m[2];
    const abs = absoluteUrl(req, raw);
    if (abs) urls.add(abs);
  }
  return Array.from(urls);
}
function extractAllUrls(text = "") {
  const re = /\bhttps?:\/\/[^\s)]+/gi;
  return Array.from(text.matchAll(re)).map(m => m[0]);
}
function buildImageContextNote(imgUrls) {
  if (!imgUrls?.length) return "";
  const bullets = imgUrls.map(u => `- ${u}`).join("\n");
  return `\n\n### Attached images\nAnalyze the following image URLs along with my request:\n${bullets}\n`;
}

/* ======================= Binance catalog (crypto) ======================= */
const BINANCE_EXCHANGE_URL = "https://api.binance.com/api/v3/exchangeInfo";
async function refreshBinanceCatalog() {
  const now = Date.now();
  if (now - _binCache.ts < 30 * 60 * 1000) return;
  const r = await withTimeout(fetch(BINANCE_EXCHANGE_URL, UA), 12000);
  const j = await r.json();
  const bases = new Set();
  const symbols = new Set();
  const quotesMap = new Map();
  for (const s of j.symbols || []) {
    if (s.status !== "TRADING") continue;
    const base = s.baseAsset.toUpperCase();
    const quote = s.quoteAsset.toUpperCase();
    bases.add(base);
    symbols.add(base + quote);
    if (!quotesMap.has(base)) quotesMap.set(base, new Set());
    quotesMap.get(base).add(quote);
  }
  _binCache = { ts: now, bases, symbols, quotesMap };
}

/* ======================= LLM-based Symbol Resolution ======================= */
function parseLastJsonObject(text = "") {
  const i = text.lastIndexOf("{");
  const j = text.lastIndexOf("}");
  if (i === -1 || j === -1 || j < i) return null;
  try { return JSON.parse(text.slice(i, j + 1)); } catch { return null; }
}
async function llmGuessSymbol(sentence) {
  const SYSTEM = `
You map a user's sentence to a single tradable instrument symbol with machine-usable tickers.

Output ONLY compact JSON, no prose. Keys:
- "kind": one of ["equity","crypto","fx","index","commodity","unknown"]
- "yahoo_symbol": primary Yahoo Finance symbol (e.g., RELIANCE.NS, AAPL, BTC-USD, EURUSD=X, ^NSEI, GC=F)
- "binance_symbol": if crypto is likely tradable on Binance (e.g., BTCUSDT), else null
- "is_indian_market": true if NSE/BSE OR INR-based FX; else false
- "confidence": 0..1

Rules:
- Prefer NSE/BSE tickers for Indian equities (e.g., RELIANCE.NS).
- Crypto: Yahoo 'BASE-USD'; Binance prefers USDT (BTCUSDT).
- FX: 'EURUSD=X' form (no slash).
- Index: caret form (^NSEI, ^BSESN, ^GSPC, ^DJI).
- Commodities (Yahoo): GC=F, SI=F, CL=F, BZ=F, NG=F, HG=F.
`.trim();

  const FEWSHOT = [
    { q: "can I hold khfm ?", a: { kind:"equity", yahoo_symbol:"KHFM-SM.NS", binance_symbol:null, is_indian_market:true, confidence:0.86 } },
    { q: "price of reliance", a: { kind:"equity", yahoo_symbol:"RELIANCE.NS", binance_symbol:null, is_indian_market:true, confidence:0.95 } },
    { q: "what about nifty today?", a: { kind:"index", yahoo_symbol:"^NSEI", binance_symbol:null, is_indian_market:true, confidence:0.9 } },
    { q: "btc live price", a: { kind:"crypto", yahoo_symbol:"BTC-USD", binance_symbol:"BTCUSDT", is_indian_market:false, confidence:0.98 } },
    { q: "analyze btc", a: { kind:"crypto", yahoo_symbol:"BTC-USD", binance_symbol:"BTCUSDT", is_indian_market:false, confidence:0.98 } },
    { q: "analyze eth", a: { kind:"crypto", yahoo_symbol:"ETH-USD", binance_symbol:"ETHUSDT", is_indian_market:false, confidence:0.98 } },
    { q: "eur/usd outlook", a: { kind:"fx", yahoo_symbol:"EURUSD=X", binance_symbol:null, is_indian_market:false, confidence:0.92 } },
    { q: "is crude breaking out?", a: { kind:"commodity", yahoo_symbol:"CL=F", binance_symbol:null, is_indian_market:false, confidence:0.8 } }
  ];

  const messages = [
    { role: "system", content: SYSTEM },
    ...FEWSHOT.flatMap(ex => ([
      { role: "user", content: ex.q },
      { role: "assistant", content: JSON.stringify(ex.a) }
    ])),
    { role: "user", content: sentence }
  ];

  let acc = "";
  for await (const token of streamLLM(messages, {
    temperature: 0,
    model: "gpt-4o-mini",
  })) {
    acc += token;
  }

  const obj = parseLastJsonObject(acc) || {};
  if (!obj || !obj.yahoo_symbol) return null;

  return {
    kind: obj.kind || "unknown",
    yahoo: obj.yahoo_symbol || null,
    binance: obj.binance_symbol || null,
    isIndianMarket: !!obj.is_indian_market
  };
}

/* ======================= Market Adapters (Yahoo) ======================= */
function pickYahooRange(interval) {
  switch (interval) {
    case "1m":  return "5d";
    case "2m":  return "10d";
    case "3m":
    case "5m":  return "1mo";
    case "15m": return "2mo";
    case "30m":
    case "60m":
    case "90m":
    case "1h":  return "6mo";
    case "1d":  return "1y";
    case "1wk": return "5y";
    case "1mo": return "10y";
    default:    return "1y";
  }
}

/* ======================= Symbol validation / normalization ======================= */
async function normalizeYahooSymbol(input) {
  const up = (input || "").toUpperCase().trim();

  // Binance style pair → Yahoo crypto
  if (/^[A-Z0-9]{2,10}(USDT|USD)$/.test(up)) {
    const base = up.replace(/USDT$|USD$/,'');
    return `${base}-USD`;
  }

  // Bare Indian equity → try .NS then .BO, else search
  if (/^[A-Z0-9.^-]{1,12}$/.test(up) && !/[.](NS|BO)$/i.test(up) && !up.startsWith("^") && !/-USD$/.test(up)) {
    const ns = `${up}.NS`;
    const qns = await getYahooQuoteV7(ns).catch(()=>null);
    if (qns?.regularMarketPrice != null || qns?.symbol) return ns;

    const bo = `${up}.BO`;
    const qbo = await getYahooQuoteV7(bo).catch(()=>null);
    if (qbo?.regularMarketPrice != null || qbo?.symbol) return bo;

    const best = await yahooSearchBestSymbol(up).catch(()=>null);
    if (best) return best;
  }

  // Already Yahoo-like; verify once
  const v7 = await getYahooQuoteV7(up).catch(()=>null);
  if (v7?.symbol) return v7.symbol;

  const best = await yahooSearchBestSymbol(up).catch(()=>null);
  return best || up;
}

async function getYahooChart(symbol, interval = "1d", range = null) {
  const rng = range || pickYahooRange(interval);
  const key = `yc:${String(symbol || "").trim().toUpperCase()}:${interval}:${rng}`;

  return dedupe(
    key,
    async () => {
      const base = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${rng}`;
      const alt  = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${rng}`;
      let j = null;

      try {
        j = await fetchJsonLogged(base, { headers: UA_HEADERS }, "yahoo_chart_q1");
      } catch (e1) {
        try {
          j = await fetchJsonLogged(alt, { headers: UA_HEADERS }, "yahoo_chart_q2");
        } catch (e2) {
          logErr("yahoo_chart_both_failed", { symbol, interval, range: rng, e1: e1?.message, e2: e2?.message });
          return null;
        }
      }

      const res = j?.chart?.result?.[0];
      if (!res?.timestamp || !Array.isArray(res.timestamp) || !res.timestamp.length) {
        logErr("yahoo_chart_no_result", {
          symbol,
          interval,
          range: rng,
          raw: j?.chart?.error || null
        });
        return null;
      }

      const q  = res.indicators?.quote?.[0] || {};
      const ts = res.timestamp;
      let candles = [];
      for (let i = 0; i < ts.length; i++) {
        const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i];
        if ([o, h, l, c].some(x => x == null)) continue;
        candles.push({ t: ts[i] * 1000, o, h, l, c, v: v ?? 0 });
      }

      // Trim early — keep just what TA needs (last ~160 bars)
      if (candles.length > 160) candles = candles.slice(-160);

      const meta = res.meta || {};
      return { candles, meta };
    },
    8_000 // TTL ms
  );
}
/* ======================= NEW: Fast Yahoo Quote (v7) — single definition ======================= */
async function getYahooQuoteV7(symbol) {
  const key = `yq7:${String(symbol || "").trim().toUpperCase()}`;
  return dedupe(
    key,
    async () => {
      const base = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
      const alt  = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;

      try {
        const j = await fetchJsonLogged(base, { headers: UA_HEADERS, timeout: 9000 }, "yahoo_quote_q1");
        return j?.quoteResponse?.result?.[0] || null;
      } catch (e1) {
        try {
          const j2 = await fetchJsonLogged(alt, { headers: UA_HEADERS, timeout: 9000 }, "yahoo_quote_q2");
          return j2?.quoteResponse?.result?.[0] || null;
        } catch (e2) {
          logErr("yahoo_quote_both_failed", { symbol, e1: e1?.message, e2: e2?.message });
          return null;
        }
      }
    },
    8_000 // TTL ms
  );
}
/* ======================= Binance (Crypto) ======================= */
function mapTfToBinance(tf) {
  const tfMap = {
    "1m":"1m","2m":"1m","3m":"3m","5m":"5m","15m":"15m","30m":"30m",
    "60m":"1h","90m":"1h","1h":"1h","1d":"1d","1wk":"1w","1mo":"1M"
  };
  return tfMap[tf] || "1d";
}

async function fetchCryptoBinance(symbolYahoo, tf) {
  let base = symbolYahoo.toUpperCase().replace(/-USD$/,'').replace(/USD$/,'');
  await refreshBinanceCatalog().catch(e => logErr("binance_catalog", { error: errMessage(e) }));
  const pref = ["USDT","USD","BUSD","USDC","INR"];
  const quotes = _binCache.quotesMap.get(base) || new Set();
  let quote = pref.find(q => quotes.has(q)) || Array.from(quotes)[0] || "USDT";
  if (quote === "USD" && quotes.has("USDT")) quote = "USDT";
  const symbol = `${base}${quote}`;
  const interval = mapTfToBinance(tf);
  const klUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=500`;

  let arr;
  try {
    const j = await fetchJsonLogged(klUrl, { headers: UA_HEADERS }, "binance_klines");
    arr = j;
    if (!Array.isArray(arr) || !arr.length) throw new Error("binance_klines_empty");
  } catch (e) {
    e._context = { where: "binance_klines", symbol, interval };
    throw e;
  }

  const candles = arr.map(k => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
  let lastPrice = candles[candles.length - 1]?.c;

  try {
    const pUrl = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;
    const p = await fetchJsonLogged(pUrl, { headers: UA_HEADERS }, "binance_ticker_price");
    if (p?.price) lastPrice = +p.price;
  } catch (e) {
    logErr("binance_ticker_price_fail", { symbol, error: errMessage(e) });
  }

  return buildSnapshotFromCandles(candles, tf, false, "binance", lastPrice, symbol);
}

/* ======================= FX via Yahoo (fast) ======================= */
function resolveFxToYahoo(pair = "USD/INR") {
  const [b, q] = pair.toUpperCase().split("/");
  if (!b || !q) return null;
  return `${b}${q}=X`;
}

/* ======================= TA helpers ======================= */
function ema(values, period) {
  const out = new Array(values.length).fill(null), k = 2/(period+1);
  let prev = 0, sum = 0;
  for (let i=0;i<values.length;i++) {
    const v = values[i];
    if (i < period) { sum += v; if (i === period-1) { prev = sum/period; out[i] = prev; } }
    else { prev = v*k + prev*(1-k); out[i] = prev; }
  }
  return out;
}
function buildSnapshotFromCandles(candles, tf, isIndianMarket, sourceTag, forceLast=null, binanceStreamSymbol=null) {
  if (!candles?.length) return { ok:false, error:"no_candles", isIndianMarket, tf };
  const closes = candles.map(k=>k.c);
  const i = closes.length-1;
  const hi = Math.max(...candles.slice(-120).map(k=>k.h));
  const lo = Math.min(...candles.slice(-120).map(k=>k.l));
  const e10 = ema(closes,10)[i], e20 = ema(closes,20)[i], e50 = ema(closes,50)[i];
  let pv=0, vol=0; const N=Math.min(120,candles.length);
  for (let j=candles.length-N;j<candles.length;j++){ const k=candles[j], tp=(k.h+k.l+k.c)/3; pv+=tp*(k.v||1); vol+=(k.v||1); }
  const vwap = vol? pv/vol : closes[i];
  const to2 = (x)=>Number.parseFloat(x).toFixed(2);
  return { ok:true, source:sourceTag, tf, candles,
    latest: to2(forceLast != null ? forceLast : closes[i]),
    hi: to2(hi), lo: to2(lo),
    ema10: to2(e10), ema20: to2(e20), ema50: to2(e50),
    vwap: to2(vwap),
    yahooSnap:null,
    isIndianMarket,
    binanceStreamSymbol
  };
}

/* ======================= Symbol Resolution (legacy utilities retained) ======================= */
function resolveIndexSymbol(raw = "") {
  const s = raw.trim().toUpperCase();
  const map = {
    NIFTY: "^NSEI", NIFTY50: "^NSEI", SENSEX: "^BSESN", BANKNIFTY: "^NSEBANK", FINNIFTY: "^NSEFIN", MIDCAPNIFTY: "^CNXMIDCAP",
    SPX: "^GSPC", SP500: "^GSPC", DOW: "^DJI", NASDAQ100: "^NDX", NASDAQ: "^IXIC",
    RUSSELL2000: "^RUT", FTSE100: "^FTSE", DAX: "^GDAXI", CAC40: "^FCHI"
  };
  return map[s] || s;
}
function resolveCommodityToYahoo(u = "") {
  const s = u.toUpperCase();
  const map = {
    GOLD: "GC=F", XAU: "GC=F", SILVER: "SI=F", XAG: "SI=F",
    CRUDE: "CL=F", WTI: "CL=F", USOIL: "CL=F", BRENT: "BZ=F", UKOIL: "BZ=F",
    NATGAS: "NG=F", GAS: "NG=F", COPPER: "HG=F"
  };
  return map[s] || null;
}
function resolveCryptoToYahoo(raw = "BTC") {
  const s = raw.toUpperCase().replace(/USDT$|USD$/,"").replace(/[^A-Z0-9]/g,"");
  return `${s}-USD`;
}
function resolveEquitySymbol(raw = "") {
  const s = raw.trim().toUpperCase();
  if (/[.](NS|BO|AX|TO|L|HK|SZ|SS)$/i.test(s) || s.startsWith("^")) return s;
  return s;
}
function classifyInstrument(raw = "", marketHint = null) {
  const s = raw.trim(); const u = s.toUpperCase(); const indianHint = (marketHint||"").toLowerCase()==="indian";
  if (u.startsWith("^")) return { kind:"index", yahoo: resolveIndexSymbol(u), isIndianMarket:/^\^(NSE|BSE)/i.test(u) };
  if (/^(NIFTY|NIFTY50|SENSEX|BANKNIFTY|FINNIFTY|MIDCAPNIFTY|SPX|SP500|DOW|NASDAQ|NASDAQ100|RUSSELL2000|FTSE100|DAX|CAC40)$/i.test(u)) {
    const y = resolveIndexSymbol(u); return { kind:"index", yahoo:y, isIndianMarket:/NSE|BSE/i.test(y) };
  }
  const comm = resolveCommodityToYahoo(u); if (comm) return { kind:"commodity", yahoo:comm, isIndianMarket:false };
  if (/^[A-Z]{3}\/[A-Z]{3}$/.test(u)) return { kind:"fx", yahoo: resolveFxToYahoo(u), isIndianMarket:/INR/.test(u) };
  if (/^[A-Z]{6}=X$/.test(u)) return { kind:"fx", yahoo:u, isIndianMarket:/INR/.test(u) };
  if (/^[A-Z]{6}$/.test(u)) { const base=u.slice(0,3), quote=u.slice(3); return { kind:"fx", yahoo:`${base}${quote}=X`, isIndianMarket:quote==="INR" }; }
  if (/^(XAUUSD|XAGUSD)$/i.test(u)) return { kind:"fx", yahoo:`${u}=X`, isIndianMarket:false };
  if (/^(BTC|ETH|SOL|XRP|DOGE|ADA|MATIC|AAVE|LTC|DOT|BCH|SHIB|PEPE|LINK|TON|ARB|OP|ATOM|NEAR|ETC)(USDT|USD)?$/i.test(u) || /^[A-Z0-9]{2,10}-USD$/.test(u)) {
    const base = u.replace(/-USD$/,""); const y = /^[A-Z0-9]{2,10}-USD$/.test(u) ? u : resolveCryptoToYahoo(base);
    return { kind:"crypto", yahoo:y, isIndianMarket:false };
  }
  if (/[.](NS|BO|AX|TO|L|HK|SZ|SS)$/i.test(u) || /^NSE:|^BSE:/i.test(u)) {
    const y = u.replace(/^NSE:|^BSE:/,""); return { kind:"equity", yahoo:y, isIndianMarket:/(\.NS|\.BO|^NSE:|^BSE:)/i.test(u) };
  }
  if (/^[A-Z0-9.^-]{1,12}$/.test(u)) {
    const eq = resolveEquitySymbol(u); return { kind:"equity", yahoo:eq, isIndianMarket:/\.NS|\.BO$/i.test(eq) || indianHint };
  }
  return { kind:"unknown", yahoo:u, isIndianMarket:indianHint };
}
async function yahooSearchBestSymbol(raw) {
  const q = raw.trim(); if (!q) return null;
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=6&newsCount=0`;
    const r = await withTimeout(fetch(url, UA), 10000);
    const j = await r.json(); const quotes = j?.quotes || [];
    const norm = q.toUpperCase();
    const score = it => {
      let s = 0; const sym = (it.symbol || "").toUpperCase(); const exch = (it.exchange || it.exchangeDisp || "").toUpperCase();
      if (sym === norm) s += 50;
      if (sym.replace(/[.-]/g,"") === norm.replace(/[.-]/g,"")) s += 20;
      if (it.quoteType === "EQUITY") s += 10;
      if (/NSE|BSE/i.test(exch)) s += 8; if (/NASDAQ|NMS|NYS|NYQ|NYSE/i.test(exch)) s += 4;
      return s;
    };
    const best = quotes.filter(q => q.symbol && (q.quoteType === "EQUITY" || q.typeDisp === "Equity")).sort((a,b)=>score(b)-score(a))[0];
    if (!best) {
      const trySyms = [`${norm}.NS`, `${norm}.BO`, norm];
      for (const s of trySyms) {
        const chart = await getYahooChart(s, "1d").catch(()=>null);
        const meta = chart?.meta;
        if (meta?.regularMarketPrice != null) return s;
      }
      return null;
    }
    const sym = best.symbol;
    const chart = await getYahooChart(sym, "1d").catch(()=>null);
    return (chart?.meta?.regularMarketPrice != null) ? sym : null;
  } catch { return null; }
}

/* ===== NEW: helpers you referenced but hadn’t defined (safe, minimal) ===== */
function parseInstrumentDynamic(text = "") {
  const t = String(text).trim().toUpperCase();

  // Crypto pairs: BTC/USDT, BTCUSDT, ETH USD, etc.
  const m1 = t.match(/\b([A-Z0-9]{2,10})[\/\s-]?([A-Z]{3,5})\b/);
  if (m1) {
    const base = m1[1].replace(/[^A-Z0-9]/g, "");
    const quote = m1[2].replace(/[^A-Z]/g, "");
    const knownQuotes = new Set(["USDT","USD","BUSD","USDC","INR","BTC","ETH"]);
    if (knownQuotes.has(quote)) {
      const isCrypto = quote === "USDT" || quote === "BUSD" || base === "BTC" || base === "ETH";
      if (isCrypto) {
        const yahoo = `${base}-USD`;
        return { kind: "crypto", base, quote, yahoo, display: `${base}/${quote}` };
      }
      // FX like EUR/USD
      if (quote.length === 3 && base.length === 3) {
        const yahoo = `${base}${quote}=X`;
        return { kind: "fx", base, quote, yahoo, display: `${base}/${quote}` };
      }
    }
  }
  // Tight BTCUSDT-like
  const m2 = t.match(/\b([A-Z0-9]{2,10})(USDT|USD|BUSD|USDC|INR)\b/);
  if (m2) {
    const base = m2[1], quote = m2[2];
    return { kind: "crypto", base, quote, yahoo: `${base}-USD`, display: `${base}/${quote}` };
  }
  // FX 6 letters → EURUSD=X
  const m3 = t.match(/\b([A-Z]{6})\b/);
  if (m3) {
    const pair = m3[1];
    if (/^[A-Z]{6}$/.test(pair)) {
      const base = pair.slice(0,3), quote = pair.slice(3);
      return { kind: "fx", base, quote, yahoo: `${base}${quote}=X`, display: `${base}/${quote}` };
    }
  }
  return null;
}
async function resolveEquityYahooSymbol(nameOrSymbol = "") {
  // Try direct normalize → if not, use Yahoo search best match
  const up = (nameOrSymbol || "").trim().toUpperCase();
  if (!up) return null;
  // If already looks Yahoo-ish, return it
  if (/[.](NS|BO|AX|TO|L|HK|SZ|SS)$/i.test(up) || up.startsWith("^") || /-USD$/.test(up)) return up;
  // Search the best symbol (prefers NSE/BSE via scorer)
  const best = await yahooSearchBestSymbol(up).catch(()=>null);
  return best;
}
async function getYahooChartCandlesOnly(symbol, interval = "1d") {
  const ch = await getYahooChart(symbol, interval).catch(()=>null);
  return ch?.candles || null;
}

// === put this helper once (outside the function, e.g. near the top) ===
function extractEquityCandidate(raw) {
  const intentWords = [
    "price","quote","live","current","analyze","analysis","overview","report","signal","setup",
    "chart","entry","target","hold","keep","buy","sell","exit","opinion","review","outlook",
    "should","can","could","would","i","me","my","on","of","for","the","a","an","to","in","at"
  ];
  const rx = new RegExp("\\b(" + intentWords.join("|") + ")\\b", "gi");
  return String(raw || "").toLowerCase().replace(rx, " ").replace(/\s{2,}/g, " ").trim();
}
// === Strip timeframe clauses from user text so symbol detection stays clean ===
const TF_WORDS = [
  "1m","2m","3m","5m","15m","30m","60m","90m","1h","4h","1d","1wk","1mo",
  "min","mins","minute","minutes","hour","hours","day","daily","week","weekly","month","monthly",
  "intraday","intra-day","scalp","scalping","short term","long term","swing"
];

/**
 * Removes phrases like "on 1h", "in 15m", "at 30m", "intraday", etc.
 * Also trims extra spaces after removal.
 */
function stripTimeframeClauses(text = "") {
  if (!text) return text;

  let s = " " + text + " "; // pad to simplify word-boundary deletions

  // remove patterns: " on 15m ", " in 1h ", " at 30m "
  s = s.replace(/\b(?:on|in|at)\s+(?:\d+\s*(?:m|h|d)|1m|2m|3m|5m|15m|30m|60m|90m|1h|4h|1d|1wk|1mo)\b/gi, " ");

  // remove raw numeric TFs without a preposition: " ETH 15m ", " BTC 1h "
  s = s.replace(/\b(?:\d+\s*(?:m|h|d)|1m|2m|3m|5m|15m|30m|60m|90m|1h|4h|1d|1wk|1mo)\b/gi, " ");

  // remove semantic timeframe words
  s = s.replace(/\b(intraday|intra[-\s]?day|scalp(?:ing)?|short\s*term|long\s*term|swing|daily|weekly|monthly)\b/gi, " ");

  // squeeze spaces
  return s.replace(/\s{2,}/g, " ").trim();
}


// === drop-in replacement ===
async function classifyInstrumentSmart(raw = "", marketHint = null) {
  const s0 = stripTimeframeClauses(String(raw || ""));
  const s = String(s0 || "").replace(/\b(short\s*term|long\s*term|intraday|intra[-\s]*day|scalp(?:ing)?)\b/gi, " ").trim();
  if (!s) return { kind: "unknown", yahoo: "", isIndianMarket: false };

  if (!s) return { kind: "unknown", yahoo: "", isIndianMarket: false };

  try {
    // 0) candidate → handles: "analyze state bank of india"
    const candidate = extractEquityCandidate(s);
    if (typeof findIndianStock === "function") {
      if (candidate && candidate.length > 2) {
        const hit1 = findIndianStock(candidate, 0.7);
        if (hit1 && hit1.symbol) {
          return { kind: "equity", yahoo: `${String(hit1.symbol).toUpperCase()}.NS`, isIndianMarket: true };
        }
      }
      const hit2 = findIndianStock(s, 0.7);
      if (hit2 && hit2.symbol) {
        return { kind: "equity", yahoo: `${String(hit2.symbol).toUpperCase()}.NS`, isIndianMarket: true };
      }
    } else if (Array.isArray(globalThis.stockCatalog) && Array.isArray(globalThis.stockNames)) {
      const tryKeys = [candidate, s].filter(Boolean).map(x => x.toLowerCase());

      for (const q of tryKeys) {
        const exact = stockCatalog.find(st => {
          const sym = (st.symbol || "").toLowerCase();
          const name = (st.name || "").toLowerCase();
          const aliases = Array.isArray(st.alias) ? st.alias : [];
          return sym === q || name === q || aliases.some(a => (a || "").toLowerCase() === q);
        });
        if (exact?.symbol) {
          return { kind: "equity", yahoo: `${String(exact.symbol).toUpperCase()}.NS`, isIndianMarket: true };
        }
      }

      for (const q of tryKeys) {
        if (globalThis.stockNames.length > 0 && typeof stringSimilarity?.findBestMatch === "function") {
          const { bestMatch } = stringSimilarity.findBestMatch(q, globalThis.stockNames);
          if (bestMatch?.rating >= 0.7) {
            const key = bestMatch.target;
            const fuzzyHit = globalThis.stockCatalog.find(st =>
              st.symbol?.toLowerCase() === key ||
              st.name?.toLowerCase()   === key ||
              (Array.isArray(st.alias) && st.alias.some(a => a.toLowerCase() === key))
            );
            if (fuzzyHit?.symbol) {
              return { kind: "equity", yahoo: `${String(fuzzyHit.symbol).toUpperCase()}.NS`, isIndianMarket: true };
            }
          }
        }
      }
    }
  } catch (_) {}

  // 1) common-name aliases
  const alias = resolveCommonAlias(s);
  if (alias?.yahoo) {
    return {
      kind: alias.kind,
      yahoo: alias.yahoo,
      isIndianMarket: /(\.NS|\.BO|\^NSE|^BSE|INR|USDINR=X)/i.test(alias.yahoo)
    };
  }

  // 2) dynamic pairs
  try {
    const dyn = parseInstrumentDynamic(s);
    if (dyn) {
      return { kind: dyn.kind, yahoo: dyn.yahoo, isIndianMarket: /INR/.test(dyn.quote || "") };
    }
  } catch {}

  // 3) baseline classify
  let c = classifyInstrument(s, marketHint);

  // 3.1) snap bare Indian symbols found in your catalog to .NS
  try {
    if (c.kind === "equity" && !/[.](NS|BO|AX|TO|L|HK|SZ|SS)$/i.test(c.yahoo) && !c.yahoo.startsWith("^")) {
      const sym = String(c.yahoo).toUpperCase();
      if (Array.isArray(globalThis.stockCatalog) &&
          globalThis.stockCatalog.some(st => String(st.symbol).toUpperCase() === sym)) {
        c = { kind: "equity", yahoo: `${sym}.NS`, isIndianMarket: true };
      }
    }
  } catch {}

  // 4) Yahoo search fallback
  const looksBareEquity = c.kind === "equity" &&
                          !/[.](NS|BO|AX|TO|L|HK|SZ|SS)$/i.test(c.yahoo) &&
                          !c.yahoo.startsWith("^");
  if (looksBareEquity) {
    const best = await yahooSearchBestSymbol(c.yahoo || s).catch(() => null);
    if (best) c = { kind: "equity", yahoo: best, isIndianMarket: /[.]NS|[.]BO$/i.test(best) };
  }

  return c;
}

/* ======================= Timeframe parsing ======================= */
function parseTimeframe(text = "") {
  const t = text.toLowerCase();

  // explicit numeric hints
  const picks = [
    { rx: /\b1\s*m(in(ute)?)?\b/,   i: "1m"  },
    { rx: /\b2\s*m(in(ute)?)?\b/,   i: "2m"  },
    { rx: /\b3\s*m(in(ute)?)?\b/,   i: "3m"  },
    { rx: /\b5\s*m(in(ute)?)?\b/,   i: "5m"  },
    { rx: /\b15\s*m(in(ute)?)?\b/,  i: "15m" },
    { rx: /\b30\s*m(in(ute)?)?\b/,  i: "30m" },
    { rx: /\b1\s*h(our)?\b/,        i: "60m" },
    { rx: /\b4\s*h(our)?\b/,        i: "60m" },        // map 4h to hourly (Yahoo bins)
    { rx: /\b1\s*d(ay|aily)?\b/,    i: "1d"  },
    { rx: /\b1\s*w(eek|eekly)?\b/,  i: "1wk" },
    { rx: /\b1\s*m(onth|o)?\b/,     i: "1mo" },
  ];
  for (const p of picks) if (p.rx.test(t)) return p.i;

  // semantic phrases (make the app feel smart)
  if (/\b(scalp(ing)?|very\s*short\s*term|intra[-\s]?day|intraday|day\s*trade)\b/i.test(t)) return "15m";
  if (/\b(short[-\s]*term|near\s*term|next\s*few\s*days)\b/i.test(t)) return "60m";
  if (/\b(medium[-\s]*term|swing)\b/i.test(t)) return "1d";
  if (/\b(long[-\s]*term|positional|next\s*(few|several)\s*(months|quarters|years))\b/i.test(t)) return "1wk";

  return "1d";
}

/* ======================= Simple format helper ======================= */
function humanNum(n, d=2) {
  if (n === null || n === undefined) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n/1e12).toFixed(d) + "T";
  if (abs >= 1e9 ) return (n/1e9 ).toFixed(d) + "B";
  if (abs >= 1e6 ) return (n/1e6 ).toFixed(d) + "M";
  if (abs >= 1e3 ) return (n/1e3 ).toFixed(d) + "K";
  return Number(n).toFixed(d);
}

/* ======================= Prompts ======================= */
function educationalINPrompt({ symbol, tf, ohlcLen, latest, hi, lo, ema10, ema20, ema50, vwap }) {
  return `
You are an experienced market educator. Provide an **educational intraday analysis** of **${symbol.toUpperCase()}** using only the numbers below.
Timeframe: ${tf}
Recent data (last ${ohlcLen} candles):
- Latest: ${latest}
- Range high: ${hi}
- Range low: ${lo}
- EMA10: ${ema10}
- EMA20: ${ema20}
- EMA50: ${ema50}
- VWAP: ${vwap}
Rules:
- Use ONLY these numbers.
- Do NOT give direct buy/sell/enter/exit advice.
- Keep the tone neutral and educational.
- Present scenarios hypothetically.
- Include this exact disclaimer:
"This content is for educational purposes only and does not constitute investment advice. For personalised guidance, please consult a SEBI-registered investment adviser."
Return in HTML-enabled Markdown with short bullets and subtle emojis.
`.trim();
}
function globalTradePrompt({ symbol, side, tf, ohlcLen, latest, hi, lo, ema10, ema20, ema50, vwap }) {
  return `
You are a trading coach. Provide a **concise** analysis for **${symbol.toUpperCase()}** using ONLY the figures below.
Timeframe: ${tf}
Last ${ohlcLen} candles numbers:
- Latest: ${latest} • Hi: ${hi} • Lo: ${lo}
- EMA10: ${ema10} • EMA20: ${ema20} • EMA50: ${ema50}
- VWAP: ${vwap}
Rules:
- Derive bias from relationships (EMAs alignment, price vs VWAP, latest vs range).
- If signals conflict → say so and prefer neutral.
- Keep it under ~12 short lines.
Return in HTML-enabled Markdown with clear sections and emojis.
`.trim();
}

/* ======================= Unified snapshot (chart path) ======================= */
async function getUnifiedSnapshot(classified, tf) {
  const { kind, yahoo, isIndianMarket } = classified;

  // ---- CRYPTO: Prefer Binance always; never hit Yahoo first for short TFs ----
  if (kind === "crypto") {
    // primary try: exact TF
    try {
      return await fetchCryptoBinance(yahoo, tf);
    } catch (e1) {
      logErr("unified_crypto_binance_primary_fail", { yahoo, tf, error: errMessage(e1) });
      // smart retry: map some TFs to Binance-friendly ones
      const retryMap = { "2m":"1m", "3m":"1m", "60m":"1h", "90m":"1h" };
      const tfRetry = retryMap[tf] || tf;
      if (tfRetry !== tf) {
        try {
          return await fetchCryptoBinance(yahoo, tfRetry);
        } catch (e2) {
          logErr("unified_crypto_binance_retry_fail", { yahoo, tfRetry, error: errMessage(e2) });
        }
      }
      // last resort: daily on Binance
      try {
        return await fetchCryptoBinance(yahoo, "1d");
      } catch (e3) {
        logErr("unified_crypto_binance_last_resort_fail", { yahoo, error: errMessage(e3) });
      }
    }

    // If all Binance attempts fail, *then* try Yahoo daily as a last resort.
    try {
      const chart = await getYahooChart(yahoo, "1d");
      if (!chart?.candles?.length) throw new Error("yahoo_no_candles");
      const candles = chart.candles;
      const closes = candles.map(k=>k.c);
      const i = closes.length-1;
      const hi = Math.max(...candles.slice(-120).map(k=>k.h));
      const lo = Math.min(...candles.slice(-120).map(k=>k.l));
      const e10 = ema(closes,10)[i], e20 = ema(closes,20)[i], e50 = ema(closes,50)[i];

      let pv=0, vol=0; const N=Math.min(120,candles.length);
      for (let j=candles.length-N;j<candles.length;j++){ const k=candles[j], tp=(k.h+k.l+k.c)/3; pv+=tp*(k.v||1); vol+=(k.v||1); }
      const vwap = vol? pv/vol : closes[i];
      const to2 = (x)=>Number.parseFloat(x).toFixed(2);
      const meta = chart.meta || {};
      const lastPrice = meta.regularMarketPrice ?? closes[i];

      return {
        ok:true, source:"yahoo", tf:"1d",
        candles,
        latest: to2(lastPrice),
        hi:to2(hi), lo:to2(lo),
        ema10:to2(e10), ema20:to2(e20), ema50:to2(e50),
        vwap:to2(vwap),
        yahooSnap: {
          shortName: meta.symbol || yahoo,
          symbol: meta.symbol || yahoo,
          exchange: meta.exchangeName || "",
          currency: meta.currency || (isIndianMarket ? "INR" : "USD"),
          price: lastPrice,
          changePct: meta.regularMarketChangePercent ?? null,
          dayLow: null,
          dayHigh: null,
          previousClose: meta.previousClose ?? null,
          open: null
        },
        isIndianMarket
      };
    } catch (e4) {
      logErr("unified_crypto_all_fail", { yahoo, tf, error: errMessage(e4) });
      return { ok:false, error:`crypto_all_paths_failed:${errMessage(e4)}`, isIndianMarket, tf };
    }
  }

  // ---- NON-CRYPTO path (Yahoo) ----
  try {
    const chart = await getYahooChart(yahoo, tf);
    if (!chart?.candles?.length) {
      logErr("unified_yahoo_empty", { yahoo, tf });
      return { ok: false, error: "yahoo_no_candles", isIndianMarket, tf };
    }
    const candles = chart.candles;
    const closes = candles.map(k=>k.c);
    const i = closes.length-1;
    const hi = Math.max(...candles.slice(-120).map(k=>k.h));
    const lo = Math.min(...candles.slice(-120).map(k=>k.l));
    const e10 = ema(closes,10)[i], e20 = ema(closes,20)[i], e50 = ema(closes,50)[i];

    let pv=0, vol=0; const N=Math.min(120,candles.length);
    for (let j=candles.length-N;j<candles.length;j++){ const k=candles[j], tp=(k.h+k.l+k.c)/3; pv+=tp*(k.v||1); vol+=(k.v||1); }
    const vwap = vol? pv/vol : closes[i];
    const to2 = (x)=>Number.parseFloat(x).toFixed(2);
    const meta = chart.meta || {};
    const lastPrice = meta.regularMarketPrice ?? closes[i];

    return {
      ok:true, source:"yahoo", tf,
      candles,
      latest: to2(lastPrice),
      hi:to2(hi), lo:to2(lo),
      ema10:to2(e10), ema20:to2(e20), ema50:to2(e50),
      vwap:to2(vwap),
      yahooSnap: {
        shortName: meta.symbol || yahoo,
        symbol: meta.symbol || yahoo,
        exchange: meta.exchangeName || "",
        currency: meta.currency || (isIndianMarket ? "INR" : "USD"),
        price: lastPrice,
        changePct: meta.regularMarketChangePercent ?? null,
        dayLow: null,
        dayHigh: null,
        previousClose: meta.previousClose ?? null,
        open: null
      },
      isIndianMarket
    };
  } catch (e) {
    logErr("unified_yahoo_fail", { yahoo, tf, error: errMessage(e) });
    return { ok:false, error:`yahoo_fetch_fail:${errMessage(e)}`, isIndianMarket, tf };
  }
}

/* ======================= One-shot Live Quote Resolver ======================= */
async function getLiveQuote(inputText) {
  // 0) Try LLM resolver first (cleanest)
  const llmPick = await llmGuessSymbol(stripTimeframeClauses(inputText)).catch(() => null);
  if (llmPick?.yahoo) {
    // Crypto → prefer Binance price fast
    if (llmPick.kind === "crypto") {
      const bin = llmPick.binance;
      if (bin) {
        try {
          const r = await withTimeout(fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${bin}`, UA), 8000);
          const j = await r.json();
          if (j?.price) {
            return {
              kind: "crypto",
              label: llmPick.yahoo,
              symbol: llmPick.yahoo,
              currency: "USD",
              price: +j.price,
              changePct: null,
              binanceStreamSymbol: bin,
            };
          }
        } catch {}
      }
    }
    // Yahoo v7
    const v7 = await getYahooQuoteV7(llmPick.yahoo).catch(() => null);
    if (v7?.regularMarketPrice != null || v7?.price != null) {
      const price = v7.regularMarketPrice ?? v7.price;
      return {
        kind: llmPick.kind,
        label: v7.shortName || v7.symbol || llmPick.yahoo,
        symbol: v7.symbol || llmPick.yahoo,
        currency: v7.currency || (llmPick.isIndianMarket ? "INR" : "USD"),
        price,
        changePct: v7.regularMarketChangePercent ?? null,
        binanceStreamSymbol: llmPick.kind === "crypto" ? (llmPick.binance || null) : null
      };
    }
  }

  // 0.5) Common-name alias (bitcoin → BTC-USD, etc.)
  const alias = resolveCommonAlias(inputText);
  if (alias?.yahoo) {
    if (alias.kind === "crypto" && alias.binance) {
      try {
        const r = await withTimeout(fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${alias.binance}`, UA), 8000);
        const j = await r.json();
        if (j?.price) {
          return {
            kind: "crypto",
            label: alias.yahoo,
            symbol: alias.yahoo,
            currency: "USD",
            price: +j.price,
            changePct: null,
            binanceStreamSymbol: alias.binance,
          };
        }
      } catch {}
    }
    const v7 = await getYahooQuoteV7(alias.yahoo).catch(() => null);
    if (v7?.regularMarketPrice != null || v7?.price != null) {
      const price = v7.regularMarketPrice ?? v7.price;
      return {
        kind: alias.kind,
        label: v7.shortName || v7.symbol || alias.yahoo,
        symbol: v7.symbol || alias.yahoo,
        currency: v7.currency || (/(\.NS|\.BO|\^NSE|^BSE|INR|USDINR=X)/i.test(alias.yahoo) ? "INR" : "USD"),
        price,
        changePct: v7.regularMarketChangePercent ?? null,
        binanceStreamSymbol: alias.kind === "crypto" ? (alias.binance || null) : null
      };
    }
  }

  // 1) Dynamic parse for pairs
  let dyn = null;
  try { dyn = parseInstrumentDynamic(inputText); } catch {}
  if (dyn?.kind === "crypto" && dyn.base && dyn.quote) {
    try {
      const url = `https://api.binance.com/api/v3/ticker/price?symbol=${dyn.base}${dyn.quote}`;
      const r = await withTimeout(fetch(url, UA), 8000);
      const j = await r.json();
      if (j?.price) {
        return {
          kind: "crypto",
          label: dyn.display || `${dyn.base}/${dyn.quote}`,
          symbol: `${dyn.base}${dyn.quote}`,
          currency: dyn.quote,
          price: +j.price,
          changePct: null,
          binanceStreamSymbol: `${dyn.base}${dyn.quote}`,
        };
      }
    } catch {}
    const yq = await getYahooQuoteV7(dyn.yahoo).catch(() => null);
    const price = yq?.regularMarketPrice ?? yq?.price ?? null;
    if (price != null) {
      return {
        kind: "crypto",
        label: dyn.display || yq.shortName || yq.symbol,
        symbol: yq.symbol || dyn.yahoo,
        currency: yq.currency || (dyn.quote || "USD"),
        price,
        changePct: yq.regularMarketChangePercent ?? null,
        binanceStreamSymbol: dyn.base && dyn.quote ? `${dyn.base}${dyn.quote}` : null,
      };
    }
  }

  // 2) Broad classify fallback
  let classified = await classifyInstrumentSmart(inputText, null);
  let ySymbol = classified.yahoo;
  if (!ySymbol) return null;

  const v7 = await getYahooQuoteV7(ySymbol).catch(() => null);
  if (v7?.regularMarketPrice != null || v7?.price != null) {
    const price = v7.regularMarketPrice ?? v7.price;
    let binanceStreamSymbol = null;
    if (classified.kind === "crypto") {
      await refreshBinanceCatalog().catch(() => {});
      const base = ySymbol.toUpperCase().replace(/-USD$/, '');
      const quotes = _binCache.quotesMap.get(base) || new Set();
      const pref = ["USDT","USD","BUSD","USDC","INR"];
      const pick = pref.find(q => quotes.has(q)) || Array.from(quotes)[0] || "USDT";
      binanceStreamSymbol = `${base}${pick}`;
    }
    return {
      kind: classified.kind,
      label: v7.shortName || v7.symbol || ySymbol,
      symbol: v7.symbol || ySymbol,
      currency: v7.currency || (classified.isIndianMarket ? "INR" : "USD"),
      price,
      changePct: v7.regularMarketChangePercent ?? null,
      binanceStreamSymbol
    };
  }

  // 3) Last resort: chart meta
  const chart = await getYahooChart(ySymbol, "1d").catch(() => null);
  const meta = chart?.meta;
  if (meta?.regularMarketPrice != null) {
    return {
      kind: classified.kind,
      label: meta.symbol || ySymbol,
      symbol: meta.symbol || ySymbol,
      currency: meta.currency || (classified.isIndianMarket ? "INR" : "USD"),
      price: meta.regularMarketPrice,
      changePct: meta.regularMarketChangePercent ?? null,
      binanceStreamSymbol: null
    };
  }

  return null;
}

/* ======================= Optional: Binance live WS to SSE ======================= */
function streamBinanceMiniTicker(res, symbol /* e.g., BTCUSDT */) {
  try {
    const wsUrl = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@miniTicker`;
    const ws = new WebSocket(wsUrl, { headers: UA.headers });
    const ping = setInterval(() => { try { ws.readyState===1 && ws.ping(); } catch {} }, 15000);
    ws.on("message", (buf) => {
      try {
        const j = JSON.parse(buf.toString());
        if (j.c) sseData(res, { type: "price", symbol, last: j.c, high: j.h, low: j.l, open: j.o });
      } catch {}
    });
    ws.on("close", () => clearInterval(ping));
    ws.on("error", () => {});
    res.on("close", () => { try { ws.close(); } catch {} });
  } catch {}
}

/***** 👇 Context-aware instrument resolver (fixed) ************************/
/***** 👇 Context-aware instrument resolver (fixed) ************************/
const PRONOUN_RX  = /\b(it|this|that|same|one)\b/i;
const PRONOUN_SET = new Set(["it","this","that","same","one"]);

// Helper: pick the last finance-looking token in the text
function pickLastFinanceToken(s = "") {
  const tokens = String(s).match(/[a-z0-9.^/=+-]{2,}/gi) || [];
  // words we don’t want as the “symbol”
  const bad = new Set([
    "price","quote","live","current","analyze","analysis","overview","report",
    "signal","setup","trade","entry","target","hold","keep","buy","sell","exit",
    "opinion","review","outlook","for","of","on","in","at","the","a","an","to",
    "is","are","short","long","term","intraday","scalping","swing","positional","idea"
  ]);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i].toLowerCase();
    if (!bad.has(t)) return tokens[i];
  }
  return null;
}

async function resolveInstrumentWithContext({ conversation, cleanedText }) {
  const lower = (cleanedText || "").toLowerCase();

  // 1️⃣  explicit match after a verb (price/analyze/etc.)
 let explicitMatch =
  lower.match(
    /\b(?:price|quote|live(?:\s*price)?|current|analy[sz]e|analysis|overview|report|signal|setup|trade(?:\s*idea)?|entry|target|hold|keep|buy|sell|exit|opinion|review|outlook)\s+(?:(?:of|for|on|in|at|the|a|an|to)\s+)?([a-z0-9.^/=+-][a-z0-9 .,^/=+-]*?)\s*$/i
  ) ||
  lower.match(/\b(?:for|on|of)\s+([a-z0-9.^/=+-]+)\b/i) ||
  lower.match(/^\s*([a-z0-9.^/=+-][a-z0-9 .,^/=+-]*?)\s*$/i);
  
  // clean up the captured token
  let tokenRaw = explicitMatch?.[1] || pickLastFinanceToken(cleanedText);
  if (tokenRaw) {
    tokenRaw = tokenRaw.replace(/[.,!?]+$/g, "").replace(/\s{2,}/g, " ").trim();
    if (PRONOUN_SET.has(tokenRaw) || isFiller(tokenRaw)) tokenRaw = null;
  }

  // 2️⃣ pronoun + memory
  if (PRONOUN_RX.test(lower) && !tokenRaw && conversation?.last_symbol) {
    return { yahoo: conversation.last_symbol, source: "context_memory_pronoun" };
  }

  // 3️⃣ alias on token (bitcoin → BTC-USD, nifty → ^NSEI …)
  if (tokenRaw) {
    const aTok = resolveCommonAlias(tokenRaw);
    if (aTok?.yahoo) return { yahoo: aTok.yahoo, source: "alias_token" };
  }

  // 4️⃣ alias on whole sentence
  const aSentence = resolveCommonAlias(cleanedText);
  if (!tokenRaw && aSentence?.yahoo) {
    return { yahoo: aSentence.yahoo, source: "alias_sentence" };
  }

  // 5️⃣ equity/keyword classifier on token
  if (tokenRaw) {
    try {
      const c = await classifyInstrumentSmart(tokenRaw, null);
      if (c?.yahoo) return { yahoo: c.yahoo, source: "explicit_token" };
    } catch {}
  }

  // 6️⃣ broader equity resolver on full sentence
  try {
    const eq = await resolveEquityYahooSymbol(cleanedText);
    if (eq) return { yahoo: eq, source: "equity_resolver" };
  } catch {}

  // 7️⃣ LLM guess as last resort
  try {
    const llm = await llmGuessSymbol(stripTimeframeClauses(cleanedText));
    if (llm?.yahoo) return { yahoo: llm.yahoo, source: "llm_guess" };
  } catch {}

  // 8️⃣ fallback to conversation memory
  if (conversation?.last_symbol) {
    return { yahoo: conversation.last_symbol, source: "context_memory_fallback" };
  }

  return { yahoo: null, source: "unresolved" };
}
/***** 👆 End helpers ************************************************************/

/** Persist the last resolved yahoo symbol on the conversation (non-fatal). */
async function rememberLastSymbol(conversationId, yahooSymbol) {
  if (!conversationId || !yahooSymbol) return;
  try {
    await db.Conversation.update(
      { last_symbol: yahooSymbol },
      { where: { id: conversationId } }
    );
  } catch (e) {
    console.error("rememberLastSymbol fail:", e?.message || e);
  }
}
/***** 👆 End helpers ************************************************************/
// ===== Greeting detector =====
const GREETING_RX = /^(hi|hii+|hello|hey+|yo|namaste|hola|gm|good\s*(morning|afternoon|evening)|what'?s\s*up|sup|hi\s*there|hello\s*there)[.! ]*$/i;

function isGreeting(s = "") {
  const t = String(s || "").trim();
  if (!t) return false;
  // very short variants like "hi", "hey", "gm"
  if (GREETING_RX.test(t)) return true;
  // also treat emojis-only waves as greeting
  if (/^[\u{1F44B}\u{1F44F}\u{1F601}\u{1F60A}\u{1F642}\u{1F44D}\s]+$/u.test(t)) return true;
  return false;
}

function buildGreeting(username = "") {
  const name = username ? ` ${username}` : "";
  return [
    `👋 Hey${name}! I’m your ProfitPhase Assistant.`,
    `I can fetch live prices, analyze charts, and explain setups — all in plain English.`,
    ``,
    `**Try:**`,
    `• price of bitcoin`,
    `• analyze RELIANCE.NS on 15m`,
    `• live price SBIN`,
    `• EUR/USD outlook`,
    `• support & resistance for AAPL`,
  ].join("\n");
}



/* ======================= Main handler (SSE) ======================= */
// controllers/assistantController.js
async function streamAssistant(req, res) {
  const userId = req.session?.user?.id || 0;
  const isJSON = /application\/json/i.test(req.headers["content-type"] || "");
  const publicIdFromClient =
    (req.query.conversation_id || (isJSON ? req.body?.conversation_id : null)) || null;
  const rawTextInput =
    (req.query.q || (isJSON ? req.body?.text : "") || "").trim();

  const cleanedText = cleanTranscript(rawTextInput);
  const { text: nlpReadyText, changed: autoFixed } = await autocorrectForNLP(cleanedText);
  const forNlp = nlpReadyText;

  const qNorm = normalizeText(cleanedText);
  const lower = cleanedText.toLowerCase();
  const imagesFromBody = isJSON ? (req.body?.images || []) : [];
  const imageUrls = extractImageUrls(req, cleanedText, imagesFromBody);
  const allImageUrls = [...imageUrls];
  const imagesNote = buildImageContextNote(allImageUrls);
  const isSmallTalk = /\b(hi|hello|hey|how are you\??|who are you\??|what(?:'s| is) your name\??|tell me a joke|good (morning|evening|night))\b/i.test(lower);

  // ---------- SSE single-start guards ----------
  let __sseOpen = false;
  const ensureSSE = () => { if (!__sseOpen) { sseStart(res); __sseOpen = true; } };
  const sendSSE  = (chunk) => { ensureSSE(); sseData(res, chunk); };
  const endSSE   = () => { if (__sseOpen) { sseDone(res); __sseOpen = false; } };

  // ---------- Greeting quick path ----------
  if (isGreeting(cleanedText)) {
    const greeting = buildGreeting(req.session?.user?.name || "");
    sendSSE({ type: "token", text: greeting });
    endSSE();
    try {
      const conversation = await db.Conversation.create({
        public_id: randomUUID(),
        user_id: userId,
        title: cleanedText || "New Chat",
        last_symbol: ""
      });
      await db.Message.create({ conversation_id: conversation.id, role: "user", content: cleanedText });
      await db.Message.create({ conversation_id: conversation.id, role: "assistant", content: greeting });
    } catch (_) {}
    return;
  }

  // ---------- Initial status ----------
  sendSSE({ type: "status", text: "🤔 Thinking…" });

  try {
    // ---------- Conversation bootstrap ----------
    let conversation = null;
    if (publicIdFromClient) {
      conversation = await db.Conversation.findOne({
        where: { public_id: publicIdFromClient, user_id: userId }
      });
    }
    if (!conversation) {
      conversation = await db.Conversation.create({
        public_id: randomUUID(),
        user_id: userId,
        title: cleanedText.slice(0, 60) || "New Chat",
        last_symbol: ""
      });
    }
    sendSSE({ type: "meta", conversation_id: conversation.public_id });

    const userStoredText = allImageUrls.length
      ? `${cleanedText}\n\n[images]\n${allImageUrls.join("\n")}`
      : cleanedText;
    await db.Message.create({
      conversation_id: conversation.id,
      role: "user",
      content: userStoredText
    });

    // ---------- Small-talk quick path ----------
    if (isSmallTalk) {
      const history = await db.Message.findAll({
        where: { conversation_id: conversation.id },
        order: [["created_at", "ASC"]],
        limit: 20
      });
      const messages = history.map(m => ({ role: m.role, content: m.content }));
      let fullAnswer = "";
      const SYSTEM_SMALLTALK = "You are a friendly, concise assistant. Keep replies short and human.";
      for await (const token of streamLLM(
        [...messages, { role: "user", content: cleanedText }],
        { systemPrompt: SYSTEM_SMALLTALK, temperature: 0.7, model: "gpt-4o" }
      )) {
        fullAnswer += token;
        sendSSE({ type: "token", text: token });
      }
      endSSE();
      await db.Message.create({ conversation_id: conversation.id, role: "assistant", content: fullAnswer });
      return;
    }


    // ---------- FAQ / KB ----------
    const hit = await searchFaqKb(db, qNorm);
    if (hit) {
      const text = hit.type === "faq"
        ? `💡 **FAQ**\n• **Q:** ${hit.item.question}\n• **A:** ${hit.item.answer}`
        : `📘 **Knowledge Base** – ${hit.item.title}\n${hit.item.body}`;
      await db.Message.create({ conversation_id: conversation.id, role: "assistant", content: text });
      sendSSE({ type: "token", text });
      endSSE();
      return;
    }

    // ---------- Utility time/date ----------
    if (/\b(date|time|day)\b/i.test(lower)) {
      const now = new Date();
      const ans = `🕒 **Current Date & Time**\n• Local: ${now.toLocaleString("en-IN",{hour12:true})}\n• ISO: ${now.toISOString()}`;
      await db.Message.create({ conversation_id: conversation.id, role: "assistant", content: ans });
      sendSSE({ type: "token", text: ans });
      endSSE();
      return;
    }

    // ---------- NLP intent ----------
    await initNLP();
    let nlp = await nlpManager.process("en", forNlp);
    if ((!nlp || nlp.intent === "None") && autoFixed) {
      nlp = await nlpManager.process("en", cleanedText);
    }
    const intent = nlp.intent || "None";
    const isPriceIntent =
      intent === "price.get" ||
      /\b(price|quote|live|current)\b/i.test(forNlp.toLowerCase());
    const isAnalysisIntent =
      intent === "analysis.do" ||
      /\b(analy[sz]e|analysis|setup|signal|hold|keep|buy|sell|exit|opinion|review|outlook|should\s+i|trade\s+idea|trade\s+setup|levels?|support|resistance|breakout|target|stop(?:\s*loss)?)\b/i
        .test(lower);

    // ---------- Symbol resolution ----------
    const { yahoo: resolvedYahoo } = await resolveInstrumentWithContext({
      conversation,
      cleanedText
    });

    // ---------- Style → timeframe ----------
    const wantsScalp    = /\bscalp(?:ing)?\b/i.test(lower);
    const wantsIntraday = /\bintra[-\s]?day\b/i.test(lower) || /\bintraday\b/i.test(lower);
    const wantsShort    = /\bshort[-\s]?term\b/i.test(lower);
    const wantsLong     = /\blong[-\s]?term\b/i.test(lower);
    const wantsAll      = /\ball\b/i.test(lower) || /\bcomplete\b/i.test(lower) || /\bfull\s*(view|report|stack)\b/i.test(lower);

    let requestedTf = null;
    let styleLabel  = null;
    if (wantsScalp)    { requestedTf = "3m";  styleLabel = "Scalping"; }
    else if (wantsIntraday) { requestedTf = "15m"; styleLabel = "Intraday"; }
    else if (wantsShort)    { requestedTf = "60m"; styleLabel = "Short-Term"; }
    else if (wantsLong)     { requestedTf = "1wk"; styleLabel = "Long-Term"; }

    const parsedFromText = parseTimeframe(lower);
    const timeframe = requestedTf || parsedFromText || "1d";
    const wantsTrade = isAnalysisIntent;

    // ---------- Vision-first (image analysis) ----------
    if (allImageUrls.length) {
      const VISION_SYSTEM = `You are a markets analyst with strong chart-reading skills. Identify trend, key levels, MA behavior, and concise scenarios.`;
      const VISION_PROMPT = [
        { role: "user", content: `${cleanedText}\n\nIf the images look like charts, read them and answer concisely.` }
      ];
      let fullAnswer = "";
      for await (const token of streamLLM(VISION_PROMPT, {
        systemPrompt: VISION_SYSTEM,
        temperature: 0.6,
        model: "gpt-4o",
        images: allImageUrls
      })) {
        fullAnswer += token;
        sendSSE({ type: "token", text: token });
      }
      endSSE();
      await db.Message.create({
        conversation_id: conversation.id,
        role: "assistant",
        content: fullAnswer
      });
      return;
    }

    // ---------- Live price ----------
    if (isPriceIntent || (/^\s*([a-z0-9.^/=+-]{2,})\s*$/i.test(lower) && !wantsTrade)) {
      let q = resolvedYahoo || cleanedText;
      if (!resolvedYahoo) {
        const llmPick = await llmGuessSymbol(stripTimeframeClauses(cleanedText)).catch(() => null);
        if (llmPick?.yahoo) q = llmPick.yahoo;
      }

      const quote = await getLiveQuote(q);
      if (!quote) {
        const warn = "⚠️ Could not resolve the instrument or fetch a live quote. Try e.g. **RELIANCE.NS**, **AAPL**, **BTC/USDT**, **EUR/USD**, **^NSEI**, **GC=F**.";
        await db.Message.create({ conversation_id: conversation.id, role: "assistant", content: warn });
        sendSSE({ type: "token", text: warn });
        endSSE();
        return;
      }

      const remember =
        resolvedYahoo ||
        (quote.symbol &&
          (quote.symbol.includes(".") ||
           quote.symbol.includes("=") ||
           quote.symbol.includes("-"))
          ? quote.symbol
          : null) ||
        null;
      if (remember) await rememberLastSymbol(conversation.id, remember);

      const updown =
        quote.changePct == null ? "" : (quote.changePct >= 0 ? "🟢" : "🔴");
      const priceVal = Number(quote.price);
      const line = `💹 **${quote.label}** — **${quote.currency} ${Number.isFinite(priceVal) ? priceVal.toLocaleString() : quote.price}**${
        quote.changePct == null ? "" : ` (${updown} ${Number(quote.changePct).toFixed(2)}%)`
      }`;
      await db.Message.create({ conversation_id: conversation.id, role: "assistant", content: line });
      sendSSE({ type: "token", text: line });

      if (quote.kind === "crypto" && quote.binanceStreamSymbol) {
        // Keep SSE open for live updates; DO NOT endSSE() here.
        streamBinanceMiniTicker(res, quote.binanceStreamSymbol);
        return;
      } else {
        endSSE();
        return;
      }
    }

    // =====================================================================
    //                      P R E - T R A D E   M O D E
    // =====================================================================
    if (wantsTrade) {
      let tokenRaw = resolvedYahoo;
      if (!tokenRaw) {
        const llmPick = await llmGuessSymbol(stripTimeframeClauses(cleanedText)).catch(() => null);
        tokenRaw = llmPick?.yahoo || null;
      }
      if (!tokenRaw) {
        sendSSE({ type: "token", text: "⚠️ I couldn't infer the instrument. Try including the symbol (e.g., RELIANCE.NS, AAPL, BTC-USD, EUR/USD)." });
        endSSE();
        return;
      }

      let classified = await classifyInstrumentSmart(tokenRaw, null);
      try {
        const llmPick = await llmGuessSymbol(stripTimeframeClauses(cleanedText)).catch(() => null);
        if (llmPick?.yahoo === tokenRaw) {
          classified = { kind: llmPick.kind, yahoo: llmPick.yahoo, isIndianMarket: !!llmPick.isIndianMarket };
        }
      } catch {}

      if (!classified.yahoo) {
        sendSSE({ type: "token", text: "⚠️ Could not resolve the instrument. Try RELIANCE.NS, AAPL, BTC-USD, EUR/USD, etc." });
        endSSE();
        return;
      }

      const STYLE_TFS = [
        { label: "Scalping",   tf: "3m",  match: wantsScalp || wantsAll },
        { label: "Intraday",   tf: "15m", match: wantsIntraday || wantsAll },
        { label: "Short-Term", tf: "60m", match: wantsShort || wantsAll },
        { label: "Long-Term",  tf: "1wk", match: wantsLong || wantsAll }
      ];
      const useMulti = STYLE_TFS.some(s => s.match && wantsAll);

      await rememberLastSymbol(conversation.id, classified.yahoo);

      const headSnap = await getUnifiedSnapshot(classified, "1d");
      if (!headSnap.ok) {
        const reason = headSnap.error || "unknown_error";
        const msg = `⚠️ Unable to fetch market data.\n• Reason: \`${reason}\``;
        logErr("stream_snapshot_fail", { input: cleanedText, tokenRaw, timeframe: "1d", reason });
        sendSSE({ type: "token", text: msg });
        endSSE();
        return;
      }
      const q = headSnap.yahooSnap || null;
      const upDown = (q?.changePct ?? 0) >= 0 ? "🟢" : "🔴";
      const header =
`📈 **${(q?.shortName || classified.yahoo)} (${(q?.symbol || classified.yahoo)})** ${q?.exchange ? "— " + q.exchange : ""}
• **Price:** ${(q?.currency || (headSnap.isIndianMarket?"INR":"USD"))} ${humanNum(q?.price ?? Number(headSnap.latest),2)}${q?.changePct==null ? "" : ` (${upDown} ${Number(q.changePct).toFixed(2)}%)`}`;
      sendSSE({ type: "token", text: header + "\n" });

      if (!useMulti) {
        const tf = timeframe;
        const snap = await getUnifiedSnapshot(classified, tf);
        if (!snap.ok) {
          const reason = snap.error || "unknown_error";
          sendSSE({ type: "token", text: `⚠️ Data unavailable (${reason})` });
          endSSE();
          return;
        }
        const pctx = {
          symbol: (q?.symbol || classified.yahoo || tokenRaw).toUpperCase(),
          tf: snap.tf,
          ohlcLen: snap.candles.length,
          latest: snap.latest,
          hi: snap.hi,
          lo: snap.lo,
          ema10: snap.ema10,
          ema20: snap.ema20,
          ema50: snap.ema50,
          vwap: snap.vwap
        };
        const prompt = snap.isIndianMarket ? educationalINPrompt(pctx) : globalTradePrompt({ ...pctx });
        const SYS = snap.isIndianMarket
          ? "You are an experienced market educator. Use ONLY the provided numbers. Neutral tone; no advice verbs."
          : "You are an experienced trading coach. Use ONLY the provided numbers. Keep it concise and structured.";

        const styleLine = styleLabel ? `${styleLabel} (${snap.tf})\n\n` : "";
        let fullAnswer = header + "\n" + styleLine;
        for await (const token of streamLLM(
          [{ role: "user", content: prompt }],
          { systemPrompt: SYS, temperature: 0.8, model: "gpt-4o" }
        )) {
          fullAnswer += token;
          sendSSE({ type: "token", text: token });
        }
        if (snap.isIndianMarket) {
          fullAnswer = fullAnswer.replace(/\b(buy|sell|enter|exit|long|short|target|stop loss|stoploss)\b/gi,"[redacted]");
        }
        endSSE();
        await db.Message.create({ conversation_id: conversation.id, role: "assistant", content: fullAnswer });
        return;
      }

      // --- MULTI STYLE ("all") ---
      const sections = [];
      for (const s of STYLE_TFS.filter(x => x.match)) {
        try {
          const snap = await getUnifiedSnapshot(classified, s.tf);
          if (!snap.ok) {
            sections.push(`### ${s.label} (${s.tf})\n- _Data unavailable (${snap.error || "unknown"})_`);
            continue;
          }
          sections.push(
            `### ${s.label} (${snap.tf})\n` +
            `- Latest: ${snap.latest} • Hi/Lo: ${snap.hi} / ${snap.lo}\n` +
            `- EMA10: ${snap.ema10} • EMA20: ${snap.ema20} • EMA50: ${snap.ema50}\n` +
            `- VWAP: ${snap.vwap}`
          );
        } catch (e) {
          sections.push(`### ${s.label}\n- _Fetch error_`);
        }
      }
      const multiBody = sections.join("\n\n");
      sendSSE({ type: "token", text: multiBody + "\n" });

      const SUMM_PROMPT = `
Using ONLY the figures below for multiple timeframes of ${(q?.symbol || classified.yahoo).toUpperCase()}, give a concise, educational comparison:
${multiBody}

Rules:
- Derive short notes on trend alignment (EMA stacks), momentum shifts, and price vs VWAP across TFs.
- If signals conflict, say so and prefer neutral.
- No directives like buy/sell/enter/exit; keep it educational.
- 8–12 short lines max, HTML-enabled Markdown.`;

      const SYS_MULTI = headSnap.isIndianMarket
        ? "You are an experienced market educator. Use ONLY the provided numbers. Neutral tone; no advice verbs."
        : "You are a trading coach. Use ONLY the provided numbers. Keep it concise and structured.";

      let finalOut = header + "\n\n" + multiBody + "\n\n";
      for await (const token of streamLLM(
        [{ role: "user", content: SUMM_PROMPT }],
        { systemPrompt: SYS_MULTI, temperature: 0.7, model: "gpt-4o" }
      )) {
        finalOut += token;
        sendSSE({ type: "token", text: token });
      }
      if (headSnap.isIndianMarket) {
        finalOut = finalOut.replace(/\b(buy|sell|enter|exit|long|short|target|stop loss|stoploss)\b/gi,"[redacted]");
      }
      endSSE();
      await db.Message.create({ conversation_id: conversation.id, role: "assistant", content: finalOut });
      return;
    }

    // ---------- Generic LLM small-talk ----------
    const history = await db.Message.findAll({
      where: { conversation_id: conversation.id },
      order: [["created_at", "ASC"]],
      limit: 20
    });
    const messages = history.map(m => ({ role: m.role, content: m.content }));
    if (imagesNote.trim()) messages.push({ role: "user", content: imagesNote.trim() });

    const SYSTEM = `
You are ProfitPhase's advanced financial analyst and helpful assistant.
• Prefer tools for live charts and technicals; don’t invent numbers.
• If images/URLs are present, consider them (charts, screenshots).
• Use clear section headers, concise bullets, and a small risk note when appropriate.
• Be instrument-agnostic (stocks, crypto, forex, indices, commodities).
• If the user asks non-finance questions, answer helpfully and concisely.`;

    let fullAnswer = "";
    for await (const token of streamLLM(messages, {
      toolHandlers,
      systemPrompt: SYSTEM,
      temperature: 0.6,
      model: "gpt-4o",
      images: allImageUrls
    })) {
      fullAnswer += token;
      sendSSE({ type: "token", text: token });
    }
    endSSE();
    await db.Message.create({ conversation_id: conversation.id, role: "assistant", content: fullAnswer });

    // ---------- Optional: auto-add to FAQ ----------
    try {
      const common = await isCommonQuestion(cleanedText, fullAnswer);
      if (common) {
        const existing = await db.Faq.findOne({
          where: db.Sequelize.where(
            db.Sequelize.fn("LOWER", db.Sequelize.col("question")),
            cleanedText.toLowerCase()
          )
        });
        if (!existing) {
          const row = await db.Faq.create({ question: cleanedText, answer: fullAnswer, source: "auto" });
          const emb = await embedText(`Q:${row.question}\nA:${row.answer}`);
          await db.Vector.create({ type: "faq", ref_id: row.id, embedding: JSON.stringify(emb) });
        }
      }
    } catch (e) { console.error("FAQ auto-store error:", e); }
  } catch (err) {
    console.error("streamAssistant error:", err);
    sendSSE({ type: "token", text: "⚠️ Sorry, something went wrong while fetching data or generating the analysis." });
    endSSE();
  }
}

/* ======================= Sidebar APIs (unchanged) ======================= */
async function listConversations(req, res) {
  const userId = req.session?.user?.id || 0;
  const rows = await db.Conversation.findAll({
    where: { user_id: userId },
    attributes: ["public_id", "title", "created_at"],
    order: [["created_at", "DESC"]],
    include: [{
      model: db.Message,
      as: "messages",
      attributes: ["id", "role", "content", "created_at"],
      separate: true,
      limit: 1,
      order: [["created_at", "DESC"]]
    }]
  });
  res.json(rows);
}
async function getMessages(req, res) {
  const publicId = req.params.public_id || req.query.id || null;
  if (!publicId) return res.status(400).json({ error: "Missing conversation public_id" });
  const conv = await db.Conversation.findOne({ where: { public_id: publicId } });
  if (!conv) return res.json([]);
  const msgs = await db.Message.findAll({
    where: { conversation_id: conv.id },
    order: [["created_at", "ASC"]]
  });
  res.json(msgs);
}
// NOTE: multer middleware should place uploaded file at req.file
async function uploadFile(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: "No file received" });
    const origin = getOrigin(req);
    const publicUrl = `${origin}/uploads/${req.file.filename}`;
    return res.json({ url: publicUrl, name: req.file.originalname });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ error: "Upload failed" });
  }
}

module.exports = {
  streamAssistant,
  listConversations,
  getMessages,
  uploadFile,
};
