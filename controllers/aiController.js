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

/**
 * POST /api/ai/trade-check
 * Body: { symbol, side: 'LONG'|'SHORT', duration: 'intraday'|'1-2 days'|'1 week', timeframe?: '15m|1h|4h|1D' }
 */
 


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


/*exports.preTradeCheck = async (req, res) => {
  const userId = req.body.user_id || req.params.user_id || req.session.user?.id;
  const { symbol, side, duration, timeframe, market } = req.body || {};
  const today = new Date().toISOString().split('T')[0];

  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!symbol || !side || !duration) {
    return res.status(400).json({ error: "symbol, side, and duration are required." });
  }

  try {
    // daily limit
    const used = await AIHoldingUsage.count({
      where: { user_id: userId, date: today, report_type: 'pretrade_check' }
    });
    if (used >= PRETRADE_DAILY_LIMIT) {
      return res.status(429).json({ error: `⚠️ Limit reached: Only ${PRETRADE_DAILY_LIMIT} AI pre-trade checks allowed per day.` });
    }

    // live OHLC (Crypto / Indian / Forex / US)
    const tf = timeframe || '1h';
    const ohlc = await getAnyOHLC(symbol, tf, market || null, 120);
    if (!ohlc?.length) return res.status(500).json({ error: 'No market data.' });

    const basics = calcBasics(ohlc);
    const { latest, hi, lo, ema20, ema50 } = basics;

    const prompt = `
You are an experienced trading coach. Evaluate a potential ${side} trade on **${symbol.toUpperCase()}**.

Timeframe: ${tf}
Recent market data (last ${ohlc.length} candles):
- Latest price: ${latest}
- Range high: ${hi}
- Range low: ${lo}
- EMA20: ${ema20}
- EMA50: ${ema50}

Rules:
- Use ONLY these numbers for any levels. Do not invent prices.
- Keep it concise and risk-first.

Return Markdown:
1) **Verdict (YES/NO)** to enter ${side} now
2) Market context (trend vs EMAs, momentum)
3) Key levels (bold the numbers above)
4) Entry idea + invalidation/stop
5) Alternatives / avoid reasons
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [{ role: "user", content: prompt }],
      //temperature: 1,
      //max_completion_tokens: 800
    });

    const verdict = completion.choices[0]?.message?.content?.trim() || "No analysis generated.";

    // save usage + report
    await AIHoldingUsage.create({ user_id: userId, date: today, report_type: "pretrade_check" });
    await AIReport.create({ user_id: userId, report_type: "pretrade_check", report_content: verdict, created_at: new Date() });

    return res.json({ verdict, latest, hi, lo, ema20, ema50 });
  } catch (err) {
    console.error('Live pre-trade error:', err?.response?.data || err.message || err);
    return res.status(500).json({ error: "Live analysis failed. Try again later." });
  }
};*/
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
