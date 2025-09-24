// services/intentRouter.js
const {
  fmt,
  parsePriceIntent,
  getCryptoPrice,
  getIndexPrice,
  getEquityPrice,
  getFxPrice
} = require("./priceService");

// Streams tokens using your SSE helpers
async function streamPriceAnswer(q, sse) {
  const intent = parsePriceIntent(q);
  if (!intent) return false; // not a price query

  sse.status("Fetching live price…");

  try {
    let res;
    if (intent.kind === "crypto") {
      res = await getCryptoPrice(intent.symbol);
      sse.token(`🪙 ${intent.symbol.toUpperCase()} Live Price: $${fmt(res.price)} ${res.currency}  \n`);
      sse.token(`_Source: ${res.provider}_`);
      sse.done();
      return true;
    }
    if (intent.kind === "index") {
      res = await getIndexPrice(intent.ticker);
      sse.token(`📈 ${res.name} Live Price: ${fmt(res.price)} ${res.currency}  \n`);
      sse.token(`_Source: ${res.provider}_`);
      sse.done();
      return true;
    }
    if (intent.kind === "fx") {
      res = await getFxPrice(intent.pair);
      sse.token(`💱 ${res.name} Rate: ${fmt(res.price, 4)} ${res.currency}  \n`);
      sse.token(`_Source: ${res.provider}_`);
      sse.done();
      return true;
    }
    if (intent.kind === "equity") {
      res = await getEquityPrice(intent.ticker);
      sse.token(`🏷️ ${res.name} (${intent.ticker}) Live Price: ${fmt(res.price)} ${res.currency}  \n`);
      sse.token(`_Source: ${res.provider}_`);
      sse.done();
      return true;
    }
  } catch (err) {
    sse.token(`⚠️ Live price temporarily unavailable. Try rephrasing (e.g., "BTC price", "NIFTY live", "USD/INR").`);
    sse.done();
    return true; // handled, even if error
  }

  return false;
}

module.exports = { streamPriceAnswer };
