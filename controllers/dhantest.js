var dc = require("dhanhq");
const dotenv = require('dotenv');
const moment = require("moment");

dotenv.config();

const { Holding, Broker, BrokerCredential } = require("../models");

dotenv.config();
const ACCESS_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpc3MiOiJkaGFuIiwicGFydG5lcklkIjoiIiwiZXhwIjoxNzU2ODIwMzE2LCJ0b2tlbkNvbnN1bWVyVHlwZSI6IlNFTEYiLCJ3ZWJob29rVXJsIjoiaHR0cHM6Ly9wcm9maXRub3RlLmFjdXRldGVjaC5pbi9kaGFuL2NhbGxiYWNrIiwiZGhhbkNsaWVudElkIjoiMTEwNDEwOTk2NCJ9.NMAUeUk_5F1VDAoAZ6zKmQvmhk40rzuz80X3WScq8GmHP9ybM2fNuZTRHHmeo54Gt6oUML1CYrbH6bhdIMalag';
const DHAN_CLIENT_ID = '1104109964';

const client = new dc.DhanHqClient({
  accessToken: ACCESS_TOKEN,
  env: "PROD"
});

exports.fetchDhanData = async (req, res) => {
  const user_id = req.session.user.id;

  try {
    // Get Broker ID
    const broker = await Broker.findOne({ where: { name: "Dhan" } });

    if (!broker) {
      return res.status(404).json({ success: false, message: "Dhan broker not found in DB" });
    }

    const holdings = await client.getHoldings();
    const funds = await client.getFundLimit();
    const positions = await client.getPositions();

    // Clean old holdings for user
    await Holding.destroy({ where: { user_id, broker_id: broker.id } });

    // Store each holding
 for (const h of holdings) {
  const instrumentId = h.securityId; // Provided in holdings
  const exchangeSegment = h.exchange; // Provided in holdings
  const { last_price, change, percent_change } = await fetchLTP(client, h.exchangeSegment, h.instrumentId);

  await Holding.create({
    user_id,
    broker_id: broker.id,
    market_type: 1,
    tradingsymbol: h.tradingSymbol,
    exchange: h.exchange,
    quantity: h.totalQty,
    isin: h.isin,
    average_price: h.avgCostPrice,
    last_price: last_price || 0, // fallback if LTP not available
    market_value: h.currentValue,
    pnl: h.totalPnL,
    day_change:change,
    created_at: moment().format(),
    updated_at: moment().format()
  });
}

    return res.json({
      success: true,
      message: `✅ Synced ${holdings.length} holdings from Dhan`,
      data: {
          holdings,
        funds,
        positions
      }
    });

  } catch (err) {
    console.error("❌ Dhan API Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch or sync Dhan data",
      error: err.message || err
    });
  }
};

async function fetchLTP(client, exchangeSegment, instrumentId) {
  try {
    const quote = await client.getQuote(exchangeSegment, instrumentId);

    return {
      last_price: quote.lastTradedPrice || 0,
      change: quote.change || 0,
      percent_change: quote.percentChange || 0,
    };
  } catch (err) {
    console.error("❌ Error fetching LTP for", instrumentId, err.message || err);
    return { last_price: 0, change: 0, percent_change: 0 };
  }
}
