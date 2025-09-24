const OpenAI = require("openai");
const { Holding, AIReport ,AIHoldingUsage,Trade} = require("../models");
const { marked } = require("marked");
const axios = require('axios');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const { Op } = require("sequelize");
// ===================== PRE-TRADE CHECK (Ask AI) =====================
const PRETRADE_DAILY_LIMIT = parseInt(process.env.AI_PRETRADE_LIMIT || '15', 15);

/* =========================
   NEW: Trading-only Chatbot
   ========================= */

// Model for chat (override via .env CHAT_MODEL=gpt-5-mini | gpt-5 | gpt-4o-mini)
const CHAT_MODEL = process.env.CHAT_MODEL || "gpt-5-mini";

// Simple trading-topic detector & advice-risk detector
const TRADING_REGEX =
  /(market|price|quote|chart|rsi|macd|ema|sma|atr|vwap|support|resistance|order|limit|stop|bracket|backtest|setup|nifty|banknifty|sensex|nasdaq|nyse|forex|pair|btc|eth|crypto|ohlc|volume|candlestick|pnl|risk|position sizing|fvg|order block|adx|supertrend|breakout|pullback|trend|strategy|indicator)/i;

const RISKY_REGEX =
  /(what should i buy|what should i sell|enter now|exit now|allocate|how many shares|personalized advice|guarantee|sure shot|target price for me|tip)/i;

function classifyTrading(text = "") {
  const t = text.toLowerCase();
  return { inScope: TRADING_REGEX.test(t), risky: RISKY_REGEX.test(t) };
}
// =====================
//  Generic AI Assistant
// =====================

/**
 * GET  /api/assistant/stream
 * SSE endpoint: streams a generic AI conversation
 * Query: ?q=your question
 */
// ===================== Advanced Streaming Assistant (ChatGPT-like) =====================
/**
 * Natural language → (symbol, timeframe, market) + live OHLC → indicators → structured prompt
 * Streams tokens to the browser as SSE at /api/assistant/stream?q=...
 *
 * NOTE: Reuses your existing getAnyOHLC(symbol, timeframe, market, limit)
 */

const TFMAP = { '15m':'15m','30m':'30m','1h':'1h','4h':'4h','1d':'1d','daily':'1d','day':'1d' };
const CRYPTO_ALIASES = {
  btc:'BTCUSDT', bitcoin:'BTCUSDT',
  eth:'ETHUSDT', ethereum:'ETHUSDT',
  sol:'SOLUSDT', bnb:'BNBUSDT'
};

// ---------- tiny NLU for query ----------
function parseQuery(q="") {
  const text = q.toLowerCase();

  // timeframe
  let timeframe = (text.match(/\b(15m|30m|1h|4h|1d|daily|day)\b/)||[])[1] || '1h';
  timeframe = TFMAP[timeframe] || '1h';

  // market & symbol
  let market = null, symbol = null;

  // crypto aliases
  for (const k of Object.keys(CRYPTO_ALIASES)) {
    if (text.includes(k)) { symbol = CRYPTO_ALIASES[k]; market = 'crypto'; break; }
  }
  // explicit crypto pairs like btc/usdt, eth-usdt, btcusd, etc.
  if (!symbol) {
    const pair = (text.match(/\b([a-z]{2,10})[\/:\-\s]?(usdt|usd)\b/i)||[])[0];
    if (pair) { symbol = pair.replace(/[\s:\/\-]/g,'').toUpperCase(); market = 'crypto'; }
  }

  // forex (EURUSD / EUR/USD)
  if (!symbol && /[A-Za-z]{3}\/?[A-Za-z]{3}/.test(q) && q.length <= 20) {
    symbol = q.toUpperCase().replace('/','').trim();
    market = 'forex';
  }

  // Indian (NIFTY / BANKNIFTY / RELIANCE)
  if (!symbol && /(nifty|banknifty|sensex)/i.test(q)) {
    symbol = '^NSEI'; market = 'indian';
  }

  // If still unknown but looks like ticker
  if (!symbol) {
    const tick = (q.match(/\b[A-Za-z.&-]{1,10}\b/g)||[]).find(t => t.length>=2 && t.length<=10);
    if (tick) symbol = tick.toUpperCase();
  }

  return { symbol, timeframe, market };
}

// ---------- indicators ----------
function EMA(series, n){
  const k = 2/(n+1);
  let ema = series[0];
  for (let i=1;i<series.length;i++) ema = series[i]*k + ema*(1-k);
  return +ema.toFixed(2);
}
function RSI(closes, period=14){
  if (closes.length < period+1) return null;
  let gains=0, losses=0;
  for (let i=1;i<=period;i++){
    const diff = closes[i]-closes[i-1];
    if (diff>=0) gains += diff; else losses -= diff;
  }
  gains/=period; losses/=period;
  let rs = losses === 0 ? 100 : gains / losses;
  let rsi = 100 - (100 / (1+rs));
  for (let i=period+1;i<closes.length;i++){
    const diff = closes[i]-closes[i-1];
    const gain = Math.max(diff,0), loss = Math.max(-diff,0);
    gains = (gains*(period-1)+gain)/period;
    losses = (losses*(period-1)+loss)/period;
    rs = losses===0?100:gains/losses;
    rsi = 100 - (100/(1+rs));
  }
  return +rsi.toFixed(2);
}
function ATR(candles, period=14){
  if (candles.length < period+1) return null;
  const TR = [];
  for (let i=1;i<candles.length;i++){
    const h=candles[i].high, l=candles[i].low, cPrev=candles[i-1].close;
    TR.push(Math.max(h-l, Math.abs(h-cPrev), Math.abs(l-cPrev)));
  }
  // Wilder's
  let atr = TR.slice(0, period).reduce((a,b)=>a+b,0)/period;
  for (let i=period;i<TR.length;i++){
    atr = (atr*(period-1) + TR[i]) / period;
  }
  return +atr.toFixed(2);
}
function swingLevels(candles, lookback=50){
  const last = candles.slice(-lookback);
  const hi = Math.max(...last.map(c=>c.high));
  const lo = Math.min(...last.map(c=>c.low));
  return { hi:+hi.toFixed(2), lo:+lo.toFixed(2) };
}

// ---------- prompt builder ----------
function buildPrompt({q, symbol, timeframe, market, metrics}){
  const block = metrics ? `
[DATA BLOCK]
symbol: ${symbol}
market: ${market || 'auto'}
timeframe: ${timeframe}
latest: ${metrics.latest}
ema20: ${metrics.ema20}
ema50: ${metrics.ema50}
rsi14: ${metrics.rsi14}
atr14: ${metrics.atr14}
swing_high: ${metrics.hi}
swing_low: ${metrics.lo}
long_trigger: ${metrics.longTrig}
short_trigger: ${metrics.shortTrig}
long_stop_hint: ${metrics.longStop}
short_stop_hint: ${metrics.shortStop}
` : '';

  return `
You are ProfitPhase **Pro Assistant**, a professional yet cautious market educator.

**Rules**
- If the user asks for entries/exits, give **conditional, hypothetical plans** using the data block levels (no personalized advice).
- Structure sections: **Trend**, **Momentum**, **Key Levels**, **Scenarios** (Long/Short with triggers & invalidation), **Risk Notes**, **Summary**.
- Keep it concise, numerical, and practical. Use bullet points when helpful.
- End with: "Educational only. Not investment advice."

${block}

[USER REQUEST]
${q}
`;
}

// ---------- main streaming handler ----------
exports.streamAssistant = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) { res.status(400).end("Missing q"); return; }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const parsed = parseQuery(q);
    let metrics = null;

    // Try to fetch market data if we have/guess a symbol
    if (parsed.symbol) {
      try {
        const tf = parsed.timeframe || '1h';
        const ohlc = await getAnyOHLC(parsed.symbol, tf, parsed.market || null, 300);
        if (ohlc?.length) {
          const closes = ohlc.map(c=>c.close);
          const ema20 = EMA(closes, 20);
          const ema50 = EMA(closes, 50);
          const rsi14 = RSI(closes, 14);
          const atr14 = ATR(ohlc, 14);
          const { hi, lo } = swingLevels(ohlc, 60);
          const latest = +closes[closes.length-1].toFixed(2);

          // Hypothetical triggers from S/R ± ATR
          const longTrig  = +(hi + 0.1*atr14).toFixed(2);
          const shortTrig = +(lo - 0.1*atr14).toFixed(2);
          const longStop  = +(latest - 1.2*atr14).toFixed(2);
          const shortStop = +(latest + 1.2*atr14).toFixed(2);

          metrics = { latest, ema20, ema50, rsi14, atr14, hi, lo,
                      longTrig: longTrig, shortTrig: shortTrig,
                      longStop: longStop, shortStop: shortStop };
        }
      } catch (e) {
        console.warn("Market fetch failed:", e?.message || e);
      }
    }

    const systemMsg = {
      role: "system",
      content:
        "You are ProfitPhase Pro Assistant. Be factual, concise, and careful. " +
        "If markets are discussed, rely on the provided DATA BLOCK. Avoid personalized financial advice."
    };
    const userMsg = { role: "user", content: buildPrompt({ q, ...parsed, metrics }) };

    const model = process.env.CHAT_MODEL || "gpt-4o-mini";
    const stream = await openai.chat.completions.create({
      model,
      stream: true,
      temperature: 0.6,
      messages: [systemMsg, userMsg]
    });

    for await (const chunk of stream) {
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (delta) res.write(`data: ${JSON.stringify(delta)}\n\n`);
    }
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (err) {
    console.error("streamAssistant fatal:", err?.response?.data || err);
    try { res.write(`data: ${JSON.stringify("Error: "+(err.message||"failed"))}\n\n`); } catch {}
    res.end();
  }
};

// Light PII redaction
function redactPII(text = "") {
  return text
    .replace(/\b\d{10}\b/g, "[redacted]") // phone
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]") // email
    .replace(/\b\d{8,16}\b/g, "[redacted]"); // crude account
}

const SYSTEM_PROMPT_TRADING = `
You are “ProfitPhase Trading Assistant,” a trading-only educational chatbot.
Allowed: markets, instruments/tickers, indicator explanations, risk concepts, backtesting ideas, platform how-to, public news summaries.
Disallowed: personalized financial advice (what to buy/sell, allocations), tax/legal advice, guarantees or "sure-shot" calls.
If user asks outside trading: say "I can help only with trading-related topics. Try markets, strategies, indicators, or platform help."
If advice-seeking: respond in purely educational, non-directive terms (no specific buy/sell/entry/exit or allocations).
Be concise and structured. Do not fabricate numbers. Never claim certainty.
Always append: "Educational only. Not investment advice."
`.trim();

// Page renderer for the separate Trading Assistant page
exports.renderTradingAssistantPage = (req, res) => {
  res.render("assistant/index", {
    title: "ProfitPhase Trading Assistant",
    activePage: "assistant",
  });
};

/**
 * POST /api/chat
 * Body: { message: string }
 * Returns: { ok, reply }
 */
exports.chatTradingBot = async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ ok:false, reply:"Server missing OPENAI_API_KEY." });
  }
  const CHAT_MODEL = process.env.CHAT_MODEL || "gpt-5-mini";

  // small helpers
  const extract = (r)=>{
    if (!r || !Array.isArray(r.choices)) return "";
    for (const c of r.choices) {
      const t = c?.message?.content;
      if (t && typeof t === "string" && t.trim()) return t.trim();
    }
    return "";
  };

  try {
    const raw = String(req.body?.message || "").slice(0,4000);
    if (!raw) return res.json({ ok:true, reply:"Ask a trading-related question.\n\nEducational only. Not investment advice." });

    const cleaned = redactPII(raw);
    const { inScope, risky } = classifyTrading(cleaned);
    if (!inScope) {
      return res.json({ ok:true, reply:"I can help only with trading-related topics.\n\nEducational only. Not investment advice." });
    }

    const userContent = risky
      ? `User request may imply personal advice. Answer educationally, no directives.\n\nUser: ${cleaned}`
      : cleaned;

    const reqBody = {
      model: CHAT_MODEL,
      max_tokens: 500,             // no temperature (some models reject it)
      messages: [
        { role: "system", content: SYSTEM_PROMPT_TRADING },
        { role: "user", content: userContent },
      ],
    };

    let resp, text;
    try {
      resp = await openai.chat.completions.create(reqBody);
      text = extract(resp);
    } catch (e1) {
      console.error("OpenAI primary error:", e1?.response?.data || e1.message || e1);
      const fallback = process.env.CHAT_MODEL_FALLBACK || "gpt-4o-mini";
      if (fallback && fallback !== CHAT_MODEL) {
        resp = await openai.chat.completions.create({ ...reqBody, model: fallback });
        text = extract(resp);
      }
    }

    if (!text) {
      return res.status(502).json({
        ok:false,
        reply:"I couldn’t generate a reply right now. Please try again.\n\nEducational only. Not investment advice."
      });
    }
    if (!/Educational only\. Not investment advice\.$/i.test(text)) {
      text += "\n\nEducational only. Not investment advice.";
    }
    return res.json({ ok:true, reply:text });
  } catch (err) {
    console.error("chatTradingBot fatal:", err?.response?.data || err.message || err);
    return res.status(500).json({
      ok:false,
      reply:"Server error while generating a response. Please try again.\n\nEducational only. Not investment advice."
    });
  }
};


/* =========================
   EXISTING: Timeframe maps & market data helpers
   ========================= */

// map "15m|30m|1h|4h|1d" to each provider
const TF = {
  '15m': { bybit: '15', okx: '15m', coingeckoDays: 1 },
  '30m': { bybit: '30', okx: '30m', coingeckoDays: 1 },
  '1h' : { bybit: '60', okx: '1H',  coingeckoDays: 1 },
  '4h' : { bybit: '240', okx: '4H', coingeckoDays: 7 },
  '1d' : { bybit: 'D', okx: '1D',   coingeckoDays: 30 },
};

// ===== Live OHLC helpers for Crypto / Indian / Forex / US =====

// --- market detection ---
function detectMarket(symbolRaw, marketHint) {
  const s = (symbolRaw || '').toUpperCase().trim();
  if (marketHint) return marketHint;                          // 'crypto' | 'indian' | 'forex' | 'us'
  if (/USDT|BTC|ETH|SOL|BNB|XRP|DOGE|ADA|SHIB/.test(s)) return 'crypto';
  if (/^[A-Z]{6}$/.test(s) || s.includes('/')) return 'forex'; // EURUSD or EUR/USD
  if (/^[A-Z.&-]{1,10}$/.test(s)) return 'indian';             // crude NSE guess
  return 'us';
}

// --- timeframe maps ---
const TF_CRYPTO = { '15m':'15', '30m':'30', '1h':'60', '4h':'240', '1d':'D' };
const TF_OKX    = { '15m':'15m','30m':'30m','1h':'1H','4h':'4H','1d':'1D' };
const TF_YF     = { '15m':'15m','30m':'30m','1h':'60m','4h':'60m','1d':'1d' }; // 4h aggregated
const RANGE_YF  = { '15m':'5d', '30m':'5d', '1h':'1mo', '4h':'3mo', '1d':'6mo' };

// --- crypto fetchers (no Binance) ---
function normalizeCrypto(sym='') {
  const s = sym.toUpperCase().replace(/[\s:/-]/g,'');
  if (s === 'BTCUSD') return 'BTCUSDT';
  if (s === 'ETHUSD') return 'ETHUSDT';
  return s;
}
async function fetchBybit(symbol, interval, limit=100) {
  const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const { data } = await axios.get(url, { timeout: 8000 });
  if (data?.retCode !== 0) throw new Error('Bybit retCode ' + data?.retCode);
  return (data.result.list || []).map(k => ({
    time: new Date(Number(k[0])).toISOString(),
    open:+k[1], high:+k[2], low:+k[3], close:+k[4], volume:+k[5]
  })).reverse(); // newest last
}
async function fetchOKX(symbol, bar, limit=100) {
  const instId = symbol.replace('USDT','-USDT');
  const url = `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`;
  const { data } = await axios.get(url, { timeout: 8000 });
  if (data?.code !== '0') throw new Error('OKX code ' + data?.code);
  return (data.data || []).map(k => ({
    time: new Date(Number(k[0])).toISOString(),
    open:+k[1], high:+k[2], low:+k[3], close:+k[4], volume:+k[5]
  })).reverse();
}
async function fetchCoinGecko(symbol) {
  const map = { BTCUSDT:'bitcoin', ETHUSDT:'ethereum' };
  const id = map[symbol];
  if (!id) throw new Error('CoinGecko map missing for ' + symbol);
  const url = `https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=7`;
  const { data } = await axios.get(url, { timeout: 8000 });
  if (!Array.isArray(data) || !data.length) throw new Error('CoinGecko empty');
  return data.map(k => ({ time:new Date(+k[0]).toISOString(), open:+k[1], high:+k[2], low:+k[3], close:+k[4], volume:0 }));
}

// --- Yahoo Finance (forex/indian/us) ---
function buildYahooSymbol(symbolRaw, market) {
  const s = symbolRaw.toUpperCase().trim();
  if (market === 'forex') {
    const pair = s.replace('/','');
    return `${pair}=X`;                      // EURUSD=X, USDINR=X
  }
  if (market === 'indian') {
    if (s.startsWith('^')) return s;         // indices e.g., ^NSEI
    if (s.endsWith('.NS') || s.endsWith('.BO')) return s;
    return `${s}.NS`;                        // default to NSE
  }
  return s;                                  // US etc.
}
async function fetchYahoo(symbolYF, tf='60m', range='1mo') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbolYF)}?interval=${tf}&range=${range}`;
  const { data } = await axios.get(url, { timeout: 9000, headers: { 'User-Agent': 'Mozilla/5.0' } });
  const r = data?.chart?.result?.[0];
  if (!r?.timestamp) throw new Error('Yahoo empty');
  const q = r.indicators?.quote?.[0] || {};
  return r.timestamp.map((t, i) => ({
    time: new Date(t*1000).toISOString(),
    open: +q.open[i], high:+q.high[i], low:+q.low[i], close:+q.close[i], volume:+q.volume[i]
  })).filter(c => Number.isFinite(c.open));
}
function aggregateCandles(candles, n=4) {
  const out = [];
  for (let i=0; i<candles.length; i+=n) {
    const chunk = candles.slice(i, i+n);
    if (!chunk.length) continue;
    out.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map(c=>c.high)),
      low:  Math.min(...chunk.map(c=>c.low)),
      close: chunk[chunk.length-1].close,
      volume: chunk.reduce((a,c)=>a+(c.volume||0),0)
    });
  }
  return out;
}

// --- public: get OHLC for any market with fallbacks ---
async function getAnyOHLC(symbolRaw, timeframe='1h', marketHint=null, limit=120) {
  const market = detectMarket(symbolRaw, marketHint);

  if (market === 'crypto') {
    const sym = normalizeCrypto(symbolRaw);
    try { return await fetchBybit(sym, TF_CRYPTO[timeframe] || '60', limit); } catch {}
    try { return await fetchOKX(sym, TF_OKX[timeframe] || '1H', limit); } catch {}
    return await fetchCoinGecko(sym);
  }

  const tf = TF_YF[timeframe] || '60m';
  const range = RANGE_YF[timeframe] || '1mo';
  const yf = buildYahooSymbol(symbolRaw, market);
  let candles = await fetchYahoo(yf, tf, range);
  if (timeframe === '4h') candles = aggregateCandles(candles, 4);
  if (candles.length > limit) candles = candles.slice(-limit);
  return candles;
}

function calcBasics(ohlc) {
  const c = ohlc.map(k=>k.close);
  const latest = c[c.length-1];
  const hi = Math.max(...ohlc.map(k=>k.high));
  const lo = Math.min(...ohlc.map(k=>k.low));
  const emaN = (n)=>{
    const k = 2/(n+1);
    return +c.reduce((acc,p,i)=> i===0?p:(p*k + acc*(1-k)), 0).toFixed(2);
  };
  return { latest, hi, lo, ema20: emaN(20), ema50: emaN(50) };
}


/* -----------------------------
   EXISTING preTradeCheck (kept)
   ----------------------------- */
exports.preTradeCheck = async (req, res) => {
  const userId = req.body.user_id || req.params.user_id || req.session.user?.id;
  const { symbol, side, duration, timeframe, market } = req.body || {};
  const today = new Date().toISOString().split('T')[0];

  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!symbol || !side || !duration) {
    return res.status(400).json({ error: "symbol, side, and duration are required." });
  }

  try {
    // daily usage limit
    const used = await AIHoldingUsage.count({
      where: { user_id: userId, date: today, report_type: 'pretrade_check' }
    });
    if (used >= PRETRADE_DAILY_LIMIT) {
      return res.status(429).json({ error: `⚠️ Limit reached: Only ${PRETRADE_DAILY_LIMIT} AI pre-trade checks allowed per day.` });
    }

    // determine timeframe for intraday
    const tf = timeframe || '15m'; // default 15m for intraday
    const ohlc = await getAnyOHLC(symbol, tf, market || null, 120);
    if (!ohlc?.length) return res.status(500).json({ error: 'No market data.' });

    const to2 = (num) => Number.parseFloat(num).toFixed(2);
    const basics = calcBasics(ohlc);

    const latest = to2(basics.latest);
    const hi = to2(basics.hi);
    const lo = to2(basics.lo);
    const ema10 = to2(basics.ema10 || (basics.ema20 - (basics.ema20 - basics.ema50)/2)); // fallback
    const ema20 = to2(basics.ema20);
    const ema50 = to2(basics.ema50);
    const vwap = to2(basics.vwap || basics.latest); // fallback if not computed

    const indianSymbols = ['NSE:', 'BSE:', '.NS', '.BO']; 
    const isIndianMarket = 
      (market || '').toLowerCase() === 'indian' ||
      indianSymbols.some(tag => symbol.toUpperCase().includes(tag));

    let prompt;

    if (isIndianMarket) {
      prompt = `
You are an experienced market educator. Provide an **educational intraday analysis** of **${symbol.toUpperCase()}** using the numbers below.

Timeframe: ${tf}
Recent market data (last ${ohlc.length} candles):
- Latest price: ${latest}
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
- Include disclaimer exactly:  
"This content is for educational purposes only and does not constitute investment advice. For personalised guidance, please consult a SEBI-registered investment adviser."

Return in **HTML-enabled Markdown** with green headings:
<span style="color:#4CAF50; font-weight:bold;">1) Observations</span><br>
<span style="color:#4CAF50; font-weight:bold;">2) Market context</span><br>
<span style="color:#4CAF50; font-weight:bold;">3) Key levels</span><br>
Latest price: <b>${latest}</b><br>
Range high: <b>${hi}</b><br>
Range low: <b>${lo}</b><br>
EMA10: <b>${ema10}</b><br>
EMA20: <b>${ema20}</b><br>
EMA50: <b>${ema50}</b><br>
VWAP: <b>${vwap}</b><br>
<span style="color:#4CAF50; font-weight:bold;">4) Possible technical scenarios (hypothetical)</span><br>
<span style="color:#4CAF50; font-weight:bold;">5) Risk factors to monitor</span><br>
<span style="color:#4CAF50; font-weight:bold;">6) Disclaimer</span>
      `.trim();
    } else {
      prompt = `
You are an experienced trading coach. Provide **intraday trade analysis** for **${symbol.toUpperCase()}**.

Timeframe: ${tf}
Recent market data (last ${ohlc.length} candles):
- Latest price: ${latest}
- Range high: ${hi}
- Range low: ${lo}
- EMA10: ${ema10}
- EMA20: ${ema20}
- EMA50: ${ema50}
- VWAP: ${vwap}

Rules:
- Use ONLY these numbers.
- Return concise actionable intraday ideas.

Return in **HTML-enabled Markdown**:
<span style="color:#4CAF50; font-weight:bold;">1) Verdict</span>: <b>YES/NO</b> to enter ${side} now<br>
<span style="color:#4CAF50; font-weight:bold;">2) Market context</span><br>
<span style="color:#4CAF50; font-weight:bold;">3) Key levels</span><br>
Latest price: <b>${latest}</b><br>
Range high: <b>${hi}</b><br>
Range low: <b>${lo}</b><br>
EMA10: <b>${ema10}</b><br>
EMA20: <b>${ema20}</b><br>
EMA50: <b>${ema50}</b><br>
VWAP: <b>${vwap}</b><br>
<span style="color:#4CAF50; font-weight:bold;">4) Entry idea + invalidation/stop</span><br>
<span style="color:#4CAF50; font-weight:bold;">5) Alternatives / avoid reasons</span>
      `.trim();
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }]
    });

    let verdict = completion.choices[0]?.message?.content?.trim();
    if (!verdict) verdict = "⚠️ No analysis was generated. Please try again.";

    if (isIndianMarket) {
      const riskyWords = /\b(buy|sell|enter|exit|go long|go short|target|stop loss|stoploss)\b/gi;
      verdict = verdict.replace(riskyWords, "[redacted]");
    }

    await AIHoldingUsage.create({ user_id: userId, date: today, report_type: "pretrade_check" });
    await AIReport.create({
      user_id: userId,
      report_type: "pretrade_check",
      report_content: verdict,
      created_at: new Date()
    });

    return res.json({ verdict, latest, hi, lo, ema10, ema20, ema50, vwap });
  } catch (err) {
    console.error('Live pre-trade error:', err?.response?.data || err.message || err);
    return res.status(500).json({ error: "Live analysis failed. Try again later." });
  }
};


function preprocessTrades(rawTrades) {
  return rawTrades.map(t => {
    const direction = t.trade_type === "Buy" ? "Long" : "Short";
    const pnl = ((t.exit_price - t.entry_price) * t.entry_quantity * (direction === "Long" ? 1 : -1)).toFixed(2);

    return {
      symbol: t.symbol,
      entry_date: t.datetime,
      entry_price: parseFloat(t.entry_price),
      exit_price: parseFloat(t.exit_price),
      quantity: parseFloat(t.entry_quantity),
      direction,
      pnl: parseFloat(pnl),
      stop_loss: t.stop_loss || null,
      target: t.target || null,
      rationale: t.rationale || "",
      rules_followed: t.rules_followed || "",
      confidence_level: t.confidence_level || null,
      outcome: t.outcome_summary_id || null
    };
  });
}

exports.analyzeTrades = async (req, res) => {
  const userId = req.body.user_id || req.params.user_id || req.session.user?.id;
  const today = new Date().toISOString().split('T')[0];

  try {
    const trades = await Trade.findAll({
      where: {
        user_id: userId,
        entry_price: { [Op.not]: null },
        exit_price: { [Op.not]: null }
      },
      order: [['datetime', 'DESC']],
      limit: 100
    });

    if (!trades.length) {
      return res.status(404).json({ error: "No valid trades found." });
    }

    const cleanTrades = preprocessTrades(trades);

    const usageCount = await AIHoldingUsage.count({
      where: { user_id: userId, date: today, report_type: 'trade_analysis' }
    });

    if (usageCount >= 2) {
      return res.json({ error: '⚠️ Limit reached: Only 2 AI trade insights allowed per day.' });
    }

    const prompt = `
You are a professional trading analyst and behavioral coach.

You will analyze the user's trade history and auto-detect the **trading strategy**, **common mistakes**, and **psychological patterns** based only on trade attributes.

Trade Data:
${JSON.stringify(cleanTrades, null, 2)}

Instructions:
1. 🎯 Strategy Detection: Guess likely strategy used (e.g., Breakout, Scalping, Mean Reversion).
2. ❗ Mistake Detection: Infer mistakes like Overtrading, Early Exit, Poor SL, Position Sizing Errors.
3. 🧠 Emotions: Guess likely emotions – Greed, Fear, Revenge, Overconfidence, Hesitation.
4. 📊 Give 4–5 human-friendly insights in bullet format. Use emojis, **bold numbers**, and a friendly tone.

Output format:
- For each trade: symbol, date, strategy, mistakes, emotion
- Then summary insights with suggestions
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_completion_tokens: 1600,
    });

    const analysis = completion.choices[0].message.content?.trim() || "No analysis generated.";

    await AIHoldingUsage.create({
      user_id: userId,
      date: today,
      report_type: "trade_analysis"
    });

    await AIReport.create({
      user_id: userId,
      report_type: "trade_analysis",
      report_content: analysis,
      created_at: new Date()
    });

    return res.json({ message: "✅ AI trade analysis completed", analysis });

  } catch (err) {
    console.error("❌ AI Trade Analysis Error:", err?.response?.data || err.message || err);
    return res.status(500).json({ error: "AI analysis failed. Please try again later." });
  }
};

function preprocessHoldings(rawHoldings) {
  return rawHoldings.map(h => ({
    symbol: h.tradingsymbol,
    quantity: h.quantity,
    entry_price: parseFloat(h.average_price),
    current_price: parseFloat(h.last_price),
    pnl: parseFloat(h.pnl),
    market_type: h.market_type === 1 ? "Equity" : "Crypto",
    entry_date: h.created_at?.split(' ')[0],
    day_change: parseFloat(h.day_change)
  }));
}

exports.analyzeHoldings = async (req, res) => {
  const userId = req.body.user_id || req.params.user_id || req.session.user?.id;
  const today = new Date().toISOString().split('T')[0];

  try {
    const holdings = await Holding.findAll({ where: { user_id: userId } });

    if (!holdings.length) {
      return res.status(404).json({ error: "No holdings found." });
    }

    const cleanHoldings = preprocessHoldings(holdings);

    if (!cleanHoldings.length) {
      return res.status(400).json({ error: "Invalid or empty holdings data." });
    }

    const usageCount = await AIHoldingUsage.count({
      where: {
        user_id: userId,
        date: today,
        report_type: 'holding_analysis'
      }
    });

    if (usageCount >= 2) {
      return res.json({ error: '⚠️ Limit reached: Only 2 AI insights allowed per day.' });
    }

    const prompt = `
You are a professional portfolio analyst specialized in behavioral trading psychology, risk management, and portfolio optimization.

Analyze the following user holdings with a smart, human-friendly summary:

1. 📈 Top 3 profitable and 🔻 top 3 losing stocks
2. ⚠️ Sector or symbol concentration risks
3. ❗ Behavioral patterns (e.g., holding losses, overtrading, overconfidence)
4. ✅ Suggestions for rebalancing or action steps
5. Use clear bullet points, emojis for section headers, and bold important figures

Holdings:
${JSON.stringify(cleanHoldings, null, 2)}
`;

    console.error("📦 Prompt data:", JSON.stringify(cleanHoldings, null, 2));

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_completion_tokens: 1500,
    });

    const analysis = completion.choices[0].message.content?.trim() || "No analysis generated.";

    // Save usage
    await AIHoldingUsage.create({
      user_id: userId,
      date: today,
      report_type: 'holding_analysis'
    });

    // Save report
    await AIReport.create({
      user_id: userId,
      report_type: "holding_analysis",
      report_content: analysis,
      created_at: new Date(),
    });

    return res.json({
      message: "✅ AI holding analysis completed",
      analysis,
    });

  } catch (err) {
    console.error("❌ OpenAI Error:", err?.response?.data || err.message || err);
    return res.status(500).json({ error: "AI generation failed. Please try again later." });
  }
};

exports.renderAIReports = async (req, res) => {
  const userId = req.session.user?.id;

  try {
    const latestReport = await AIReport.findOne({
      where: {
        user_id: userId,
        report_type: 'holding_analysis',
      },
      order: [['created_at', 'DESC']],
    });

    const parsed = latestReport
      ? {
          ...latestReport.dataValues,
          html: marked.parse(latestReport.report_content || ""),
        }
      : null;

    res.render("holdings/ai_report", {
      title: "AI Holding Analysis",
      activePage:'',
      report: parsed,
    });
  } catch (err) {
    console.error("❌ Error loading AI holding report:", err);
    res.status(500).send("Failed to load report.");
  }
};

exports.renderAITradeReports = async (req, res) => {
  const userId = req.session.user?.id;

  try {
    const latestReport = await AIReport.findOne({
      where: {
        user_id: userId,
        report_type: 'trade_analysis',
      },
      order: [['created_at', 'DESC']],
    });

    const parsed = latestReport
      ? {
          ...latestReport.dataValues,
          html: marked.parse(latestReport.report_content || ""),
        }
      : null;

    res.render("holdings/ai_report", {
      title: "AI Trade Analysis",
      activePage:'',
      report: parsed,
    });
  } catch (err) {
    console.error("❌ Error loading AI holding report:", err);
    res.status(500).send("Failed to load report.");
  }
};

exports.chartAnalyze = (req, res) => {
  res.render('chart/chart-analyzer', { result: null, error: null,'activePage':'chart_analyzer' });
};

exports.analyzeChart = async (req, res) => {
  const userId = req.session.user?.id;
  const today = new Date().toISOString().split('T')[0];
  const fs = require('fs');
  const path = require('path');

  try {
    // Limit check
    const usageCount = await AIHoldingUsage.count({
      where: {
        user_id: userId,
        date: today,
        report_type: 'chart_analysis',
      }
    });

    if (usageCount >= 2) {
      return res.json({ success: false, error: "⚠️ Limit reached: Only 2 AI chart analyses allowed per day." });
    }

    if (!req.file || !req.file.filename) {
      return res.json({ success: false, error: "⚠️ No image uploaded." });
    }

    const filePath = path.join(__dirname, '..', 'uploads', req.file.filename);

    if (!fs.existsSync(filePath)) {
      return res.json({ success: false, error: "⚠️ Uploaded image not found on server." });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const base64Image = `data:${req.file.mimetype};base64,${fileBuffer.toString("base64")}`;

    const aiResponse = await openai.chat.completions.create({
      model: "gpt-5",
      //max_completion_tokens: 2000,
      messages: [
        {
          role: "system",
          content: "You are a professional trading analyst who specializes in interpreting technical chart images. Provide a deep, detailed, human-like analysis from the chart including trend, possible setups, support/resistance, patterns, volume, and trade ideas."
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Please analyze this trading chart and provide detailed insights.display important data like price or levels etc in bold." },
            { type: "image_url", image_url: { url: base64Image } }
          ]
        }
      ]
    });

    const result = aiResponse.choices[0]?.message?.content || "No analysis available.";

    await AIReport.create({
      user_id: userId,
      report_type: "chart_analysis",
      image: req.file.filename, // 👈 Save image file name
      report_content: result,
      created_at: new Date(),
    });

    await AIHoldingUsage.create({
      user_id: userId,
      report_type: "chart_analysis",
      date: today
    });

    return res.json({ success: true, result });

  } catch (err) {
    console.error("AI Error:", err);
    return res.json({ success: false, error: "❌ AI Analysis failed." });
  }
};

exports.getAllChartReports = async (req, res) => {
  const userId = req.session.user?.id;

  try {
    const reports = await AIReport.findAll({
      where: { user_id: userId, report_type: 'chart_analysis' },
      order: [['created_at', 'DESC']]
    });

    res.render('chart/chart-history', { reports, marked ,'activePage':'chart_history'});
  } catch (err) {
    console.error("Error fetching chart reports:", err);
    res.render('chart/all_reports', { reports: [], marked ,'activePage':'chart_analyzer'});
  }
};
