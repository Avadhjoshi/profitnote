// services/priceService.js
const fetch = require("node-fetch");

/** --- Helpers --- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fmt = (n, d=2) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  const f = Number(n);
  if (Math.abs(f) >= 1000) return f.toLocaleString(undefined, { maximumFractionDigits: d });
  return f.toFixed(d);
};

/** --- Symbol Maps --- */
const CRYPTO_ALIAS = {
  btc: "bitcoin", xbt: "bitcoin",
  eth: "ethereum",
  bnb: "binancecoin",
  sol: "solana",
  xrp: "ripple",
  ada: "cardano",
  doge: "dogecoin",
  matic: "matic-network",
  trx: "tron"
};

const INDEX_ALIAS = {
  // India
  nifty: "^NSEI",
  "nifty 50": "^NSEI",
  sensex: "^BSESN",
  banknifty: "^NSEBANK",

  // US
  dow: "^DJI",
  "dow jones": "^DJI",
  nasdaq: "^IXIC",
  spx: "^GSPC",
  "s&p 500": "^GSPC",

  // Global misc
  dax: "^GDAXI",
  ftse: "^FTSE",
  nikkei: "^N225"
};

/** --- Providers --- */

// 1) Crypto: CoinGecko (no key)
async function coingeckoPrice(coinId, vs = "usd") {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=${encodeURIComponent(vs)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
  const j = await r.json();
  const price = j?.[coinId]?.[vs];
  return { price, provider: "CoinGecko" };
}

// 2) Crypto: Binance fallback (spot ticker)
async function binancePrice(symbol = "BTCUSDT") {
  const url = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Binance ${r.status}`);
  const j = await r.json();
  const price = Number(j.price);
  return { price, provider: "Binance" };
}

// 3) Yahoo Finance quote (indices/equities/ETF)
async function yahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Yahoo ${r.status}`);
  const j = await r.json();
  const q = j?.quoteResponse?.result?.[0];
  if (!q) throw new Error("Yahoo empty");
  return {
    price: q.regularMarketPrice ?? q.postMarketPrice ?? q.preMarketPrice ?? null,
    currency: q.currency || "USD",
    name: q.shortName || q.longName || symbol,
    provider: "Yahoo Finance"
  };
}

// 4) FX rates (no key)
async function fxRate(base = "USD", quote = "INR") {
  const url = `https://api.exchangerate.host/latest?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(quote)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`FX ${r.status}`);
  const j = await r.json();
  const price = j?.rates?.[quote];
  return { price, provider: "exchangerate.host" };
}

/** --- Public API --- */
async function getCryptoPrice(symbolOrName) {
  const s = (symbolOrName || "").toLowerCase().trim();
  const coinId = CRYPTO_ALIAS[s] || s; // accept id if user typed full coingecko id

  // Try CoinGecko → Binance fallback
  try {
    const { price, provider } = await coingeckoPrice(coinId, "usd");
    if (price) return { price, currency: "USD", provider, name: s.toUpperCase() };
  } catch { /* fallthrough */ }

  // Simple Binance symbol guess (e.g., BTC → BTCUSDT)
  try {
    const sym = (s.length <= 5 ? s.toUpperCase() : s.replace(/[^a-z]/gi, "").toUpperCase()) + "USDT";
    const { price, provider } = await binancePrice(sym);
    if (price) return { price, currency: "USD", provider, name: s.toUpperCase() };
  } catch { /* ignore */ }

  throw new Error("Unable to fetch crypto price");
}

async function getIndexPrice(nameOrTicker) {
  const key = (nameOrTicker || "").toLowerCase().trim();
  const ticker = INDEX_ALIAS[key] || nameOrTicker;
  const { price, currency, name, provider } = await yahooQuote(ticker);
  return { price, currency, name, provider, ticker };
}

async function getEquityPrice(tickerLike) {
  const t = (tickerLike || "").trim();
  const { price, currency, name, provider } = await yahooQuote(t);
  return { price, currency, name, provider, ticker: t };
}

async function getFxPrice(pairLike) {
  // e.g., "USDINR" or "USD/INR"
  const raw = (pairLike || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (raw.length !== 6) throw new Error("Bad FX pair");
  const base = raw.slice(0,3), quote = raw.slice(3,6);
  const { price, provider } = await fxRate(base, quote);
  return { price, currency: quote, name: `${base}/${quote}`, provider };
}

/** --- Intent helpers --- */
function parsePriceIntent(q) {
  const text = (q || "").toLowerCase();

  // Quick crypto detect
  for (const k of Object.keys(CRYPTO_ALIAS)) {
    if (text.includes(` ${k}`) || text.startsWith(k) || text.includes(`${k} `)) {
      return { kind: "crypto", symbol: k };
    }
  }
  if (/\b(btc|bitcoin)\b/.test(text)) return { kind: "crypto", symbol: "btc" };
  if (/\b(eth|ethereum)\b/.test(text)) return { kind: "crypto", symbol: "eth" };

  // Index detect
  for (const k of Object.keys(INDEX_ALIAS)) {
    if (text.includes(k)) return { kind: "index", ticker: INDEX_ALIAS[k], label: k };
  }
  if (/nifty\s*50/.test(text)) return { kind: "index", ticker: "^NSEI", label: "NIFTY 50" };

  // FX detect e.g., "usd inr", "usd/inr", "usdinr", "eurusd"
  const fxMatch = text.replace(/\s+/g,'').match(/([a-z]{3})[\/ ]?([a-z]{3})/i);
  if (fxMatch && fxMatch[1] && fxMatch[2]) return { kind: "fx", pair: (fxMatch[1]+fxMatch[2]).toUpperCase() };

  // Equity detect (very light): "price of TCS", "AAPL live", etc.
  const eqMatch = text.match(/\b([A-Z]{1,5})\b/);
  if (eqMatch) return { kind: "equity", ticker: eqMatch[1] };

  return null;
}

module.exports = {
  fmt,
  parsePriceIntent,
  getCryptoPrice,
  getIndexPrice,
  getEquityPrice,
  getFxPrice
};
