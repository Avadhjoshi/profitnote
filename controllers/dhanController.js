const dc = require("dhanhq");
const moment = require("moment");
const { Holding, Broker, BrokerCredential } = require("../models");

exports.syncDhanHoldings = async (req, res) => {
  const user_id = req.session.user.id;

  try {
    const broker = await Broker.findOne({ where: { name: "Dhan" } });
    const cred = await BrokerCredential.findOne({
      where: { user_id, broker_id: broker.id }
    });

    if (!cred?.access_token || !cred.client_id) {
      return res.status(400).send("❌ Dhan credentials missing (client_id or access_token)");
    }

    const client = new dc.DhanHqClient({
      accessToken: cred.access_token,
      env: "PROD"
    });

    const holdings = await client.getHoldings();

    if (!Array.isArray(holdings)) {
      console.error("Unexpected holdings format:", holdings);
      return res.status(500).send("❌ Invalid holdings format from Dhan API");
    }

    await Holding.destroy({ where: { user_id, broker_id: broker.id } });

 for (const h of holdings) {
  const instrumentId = h.instrumentId; // Provided in holdings
  const exchangeSegment = h.exchangeSegment; // Provided in holdings

  const last_price = await fetchLTP(client,exchangeSegment, instrumentId);

  await Holding.create({
    user_id,
    broker_id: broker.id,
    market_type: 1,
    tradingsymbol: h.tradingSymbol,
    exchange: h.exchange,
    quantity: h.quantity,
    average_price: h.averagePrice,
    last_price: last_price || 0, // fallback if LTP not available
    market_value: h.currentValue,
    pnl: h.totalPnL,
    created_at: moment().format(),
    updated_at: moment().format()
  });
}

    res.send(`✅ Dhan holdings synced: ${holdings.length}`);
  } catch (err) {
    console.error("❌ Dhan sync error:", err);
    res.status(500).send("❌ Dhan holdings sync failed");
  }
};


async function fetchLTP(client, exchangeSegment, instrumentId) {
  try {
    const quote = await client.getQuote(exchangeSegment, instrumentId);
    return quote.lastTradedPrice || 0;
  } catch (err) {
    console.error("❌ Error fetching LTP for", instrumentId, err.message || err);
    return 0;
  }
}

exports.syncDhanTrades = async (req, res) => {
  const user_id = req.session.user.id;

  try {
    const broker = await Broker.findOne({ where: { name: "Dhan" } });
    const cred = await BrokerCredential.findOne({
      where: { user_id, broker_id: broker.id }
    });

    if (!cred?.access_token || !cred.client_id) {
      return res.status(400).send("❌ Dhan credentials missing (client_id or access_token)");
    }

    const client = new dc.DhanHqClient({
      accessToken: cred.access_token,
      env: "PROD"
    });

    const trades = await client.getTradeDetails();

    if (!Array.isArray(trades)) {
      console.error("Unexpected trade format:", trades);
      return res.status(500).send("❌ Invalid trade format from Dhan API");
    }

    let synced = 0;

    for (const t of trades) {
      const exists = await Trade.findOne({
        where: {
          user_id,
          broker_id: broker.id,
          symbol: t.tradingSymbol,
          datetime: moment(t.tradeDateTime).format("YYYY-MM-DD HH:mm:ss"),
          entry_price: t.price
        }
      });

      if (exists) continue;

      await Trade.create({
        user_id,
        broker_id: broker.id,
        market_type: 1,
        symbol: t.tradingSymbol,
        datetime: moment(t.tradeDateTime).format("YYYY-MM-DD HH:mm:ss"),
        entry_price: t.price,
        entry_quantity: t.quantity,
        entry_amount: t.price * t.quantity,
        trade_type: t.transactionType === "BUY" ? 1 : 2,
        rationale: `Synced from Dhan`,
        created_at: moment().format(),
        updated_at: moment().format()
      });

      synced++;
    }

    return res.send(`✅ Dhan trades synced: ${synced}`);
  } catch (err) {
    console.error("❌ Dhan trade sync error:", err);
    return res.status(500).send("❌ Failed to sync Dhan trades");
  }
};
