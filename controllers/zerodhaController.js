// controllers/zerodhaController.js
const { KiteConnect } = require("kiteconnect");
const moment = require("moment");
const { Op } = require("sequelize");
const { Broker, BrokerCredential, Trade, Holding } = require("../models");

/* ----------------------------- Utils ----------------------------- */

const nowStr = () => moment().format("YYYY-MM-DD HH:mm:ss");
const created_at = getCurrentISTTimestamp();

const toDateOnly = (d) => moment(d).format("YYYY-MM-DD");
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
function getCurrentISTTimestamp() {
  const options = {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  };
  // Get IST string like "12/08/2025, 11:36:19"
  const istString = new Date().toLocaleString("en-IN", options);

  // istString format is "dd/mm/yyyy, hh:mm:ss"
  const [datePart, timePart] = istString.split(", ");

  // rearrange date to yyyy-mm-dd
  const [dd, mm, yyyy] = datePart.split("/");

  return `${yyyy}-${mm}-${dd} ${timePart}`;
}


// PnL for long/short; returns {pnlInt, pnlPct}
function computePnl(tradeType /*1=long(BUY),2=short(SELL)*/, entryAvg, exitPrice, qty) {
  const entry = Number(entryAvg);
  const exit = Number(exitPrice);
  const q = Number(qty);
  const perUnit = tradeType === 1 ? (exit - entry) : (entry - exit);
  const realized = perUnit * q;
  const pnlInt = Math.round(realized); // store as INTEGER per your schema
  const denom = entry * q || 1;
  const pnlPct = (realized / denom) * 100;
  return { pnlInt, pnlPct };
}

// Proportionally allocate entry_amount/quantity when splitting an open row
function proportionAmount(totalAmount, totalQty, takeQty) {
  const tAmt = Number(totalAmount || 0);
  const tQty = Number(totalQty || 0);
  const tTake = Number(takeQty || 0);
  if (tQty <= 0) return 0;
  // Keep two decimals to avoid drift; DB column is DECIMAL(18,4) so fine
  return round2((tAmt * tTake) / tQty);
}

/* ------------------------ Credentials helper ------------------------ */

const getZerodhaCredentials = async (user_id) => {
  const broker = await Broker.findOne({ where: { name: "Zerodha" } });
  if (!broker) throw new Error("Zerodha broker not found.");

  const credentials = await BrokerCredential.findOne({
    where: { user_id, broker_id: broker.id },
  });
  if (!credentials) throw new Error("Zerodha credentials not found.");

  return { brokerId: broker.id, ...credentials.dataValues };
};

/* ------------------------ Core matching helpers ------------------------ */

// Find a single OPEN row (exit_price IS NULL) for this user/symbol & side (trade_type)
async function findOpenRow({ user_id, broker_id, symbol, trade_type }) {
  return Trade.findOne({
    where: {
      user_id,
      broker_id,
      symbol,
      trade_type,           // 1 = long (opened by BUY), 2 = short (opened by SELL)
      exit_price: { [Op.or]: [null, 0] }, // treat 0 as null if you use zero
      entry_quantity: { [Op.gt]: 0 },
    },
    order: [["created_at", "ASC"]],
  });
}

// Create a new OPEN row (no exit yet)
async function createOpenRow({
  user_id, broker_id, market_type,
  symbol, trade_type, entryPrice, qty, order_id, ts
}) {
  const entry_amount = round2(Number(entryPrice) * Number(qty));
  return Trade.create({
    user_id,
    broker_id,
    market_type,
    symbol,
    datetime: toDateOnly(ts),
    entry_price: entryPrice,
    entry_amount,
    entry_quantity: qty,
    exit_price: null,                 // open
    trade_type,                       // 1 long / 2 short
    stop_loss: null,
    target: null,
    strategy_id: null,
    outcome_summary_id: null,
    rationale: null,
    rules_followed: null,
    confidence_level: null,
    satisfaction_level: null,
    emotion_id: null,
    mistakes: null,
    lesson: null,
    created_at: created_at,
    updated_at: created_at,
    leverage: null,
    margin_used: null,
    pnl_amount: 0,
    pnl_percent: 0,
    order_id: String(order_id || ""), // you can store the last fill's id if you want
  });
}

// When averaging in to an open row
async function averageIntoOpenRow(openRow, addQty, addPrice, order_id) {
  const newQty = Number(openRow.entry_quantity) + Number(addQty);
  const newAmt = round2(Number(openRow.entry_amount) + Number(addQty) * Number(addPrice));
  const newAvg = newQty > 0 ? round2(newAmt / newQty) : 0;

  await openRow.update({
    entry_quantity: newQty,
    entry_amount: newAmt,
    entry_price: newAvg,
    updated_at: created_at,
    order_id: String(order_id || openRow.order_id || ""),
  });
}

// Create a CLOSED row representing the realized slice
async function createClosedRowFromSlice({
  openRowSnapshot, // object with fields from the open row BEFORE shrinking
  closeQty,
  exitPrice,
  closeOrderId,
  ts
}) {
  const entryQty = Number(openRowSnapshot.entry_quantity);
  const sliceQty = Number(closeQty);
  const entryAmountSlice = proportionAmount(openRowSnapshot.entry_amount, entryQty, sliceQty);
  const entryAvg = Number(openRowSnapshot.entry_price);

  const { pnlInt, pnlPct } = computePnl(
    Number(openRowSnapshot.trade_type), entryAvg, Number(exitPrice), sliceQty
  );

  return Trade.create({
    user_id: openRowSnapshot.user_id,
    broker_id: openRowSnapshot.broker_id,
    market_type: openRowSnapshot.market_type,
    symbol: openRowSnapshot.symbol,
    datetime: openRowSnapshot.datetime,      // keep entry day
    entry_price: entryAvg,
    entry_amount: entryAmountSlice,
    entry_quantity: sliceQty,
    exit_price: Number(exitPrice),           // mark as CLOSED by setting exit_price
    trade_type: openRowSnapshot.trade_type,  // keep side of original entry
    stop_loss: openRowSnapshot.stop_loss,
    target: openRowSnapshot.target,
    strategy_id: openRowSnapshot.strategy_id,
    outcome_summary_id: openRowSnapshot.outcome_summary_id,
    rationale: openRowSnapshot.rationale,
    rules_followed: openRowSnapshot.rules_followed,
    confidence_level: openRowSnapshot.confidence_level,
    satisfaction_level: openRowSnapshot.satisfaction_level,
    emotion_id: openRowSnapshot.emotion_id,
    mistakes: openRowSnapshot.mistakes,
    lesson: openRowSnapshot.lesson,
    created_at: created_at,
    updated_at: created_at,
    leverage: openRowSnapshot.leverage,
    margin_used: openRowSnapshot.margin_used,
    pnl_amount: pnlInt,
    pnl_percent: pnlPct,
    order_id: String(closeOrderId || ""),
  });
}

// Shrink the remaining OPEN row after closing a slice
async function shrinkOpenRow(openRow, closeQty) {
  const currQty = Number(openRow.entry_quantity);
  const remainQty = currQty - Number(closeQty);

  if (remainQty <= 0) {
    // fully closed → delete the open row
    await openRow.destroy();
    return;
  }

  const newEntryAmt = proportionAmount(openRow.entry_amount, currQty, remainQty);
  const newEntryAvg = remainQty > 0 ? round2(newEntryAmt / remainQty) : 0;

  await openRow.update({
    entry_quantity: remainQty,
    entry_amount: newEntryAmt,
    entry_price: newEntryAvg,
    updated_at: created_at,
  });
}

/* ----------------------------- Auth flow ----------------------------- */

exports.redirectToZerodhaLogin = async (req, res) => {
  try {
    const user_id = req.session?.user?.id;
    if (!user_id) return res.status(401).send("Unauthorized");

    const { api_key } = await getZerodhaCredentials(user_id);
    const loginUrl = `https://kite.zerodha.com/connect/login?v=3&api_key=${api_key}`;
    return res.redirect(loginUrl);
  } catch (err) {
    console.error("Zerodha login redirect error:", err.message);
    return res.status(400).send(err.message);
  }
};

exports.handleZerodhaCallback = async (req, res) => {
  const { request_token } = req.query;
  const user_id = req.session?.user?.id;
  if (!user_id) return res.status(401).send("Unauthorized");

  try {
    const { api_key, secret_key, brokerId } = await getZerodhaCredentials(user_id);

    const kc = new KiteConnect({ api_key });
    const session = await kc.generateSession(request_token, secret_key);

    await BrokerCredential.update(
      {
        access_token: session.access_token,
        updated_at: created_at,
      },
      {
        where: { user_id, broker_id: brokerId },
      }
    );

    res.redirect("/credentials?success=Zerodha connected successfully");
  } catch (err) {
    console.error("Zerodha callback error:", err.message);
    return res.status(500).send("Callback failed: " + err.message);
  }
};

/* ---------------------------- Sync trades ---------------------------- */

// ... keep all existing imports & helpers from my previous message ...

exports.syncZerodhaTrades = async (req, res) => {
  try {
    const user_id = req.session?.user?.id;
    if (!user_id) return res.status(401).send("Unauthorized");

    const broker = await Broker.findOne({ where: { name: "Zerodha" } });
    if (!broker) return res.status(404).send("Zerodha broker not found.");

    const credentials = await BrokerCredential.findOne({
      where: { user_id, broker_id: broker.id },
    });

    if (!credentials?.api_key || !credentials?.secret_key || !credentials?.access_token) {
      return res.status(400).send("Missing credentials or not connected.");
    }

    const kc = new KiteConnect({ api_key: credentials.api_key });
    kc.setAccessToken(credentials.access_token);

    const orders = await kc.getOrders();

    // Only process filled orders, sorted strictly by execution time
    const filled = orders
      .filter(o => o.status === "COMPLETE" && Number(o.filled_quantity) > 0)
      .sort((a, b) => new Date(a.exchange_timestamp || a.order_timestamp) - new Date(b.exchange_timestamp || b.order_timestamp));

    let processed = 0;
    let skipped = 0;
    
const [firstFill] = filled;
if (firstFill) {
  const theDate = new Date(firstFill.exchange_timestamp || firstFill.order_timestamp);
  const y = theDate.getFullYear(), m = String(theDate.getMonth()+1).padStart(2,'0'), d = String(theDate.getDate()).padStart(2,'0');
  const dateKey = `${y}-${m}-${d}`;
  // Delete all trades for this user, broker, that day
  await Trade.destroy({
    where: {
      user_id,
      broker_id: broker.id,
      created_at: {
        [Op.gte]: new Date(`${dateKey}T00:00:00`),
        [Op.lt]: new Date(`${dateKey}T23:59:59`)
      }
    }
  });
}


    for (const o of filled) {
      const orderId = String(o.order_id);
      const parentOrderId = o.parent_order_id ? String(o.parent_order_id) : null;

      // Set grouping key for logical trade; fallback to order id if parent not available
      const logicalOrderKey = parentOrderId || orderId;

      // Skip if already stored (same order_id for this user)
      const already = await Trade.findOne({
        where: { user_id, order_id: orderId },
      });
      if (already) {
        skipped++;
        continue;
      }

      const symbol = o.tradingsymbol;
      const qty = Number(o.filled_quantity);
      const price = Number(o.average_price);
      const txn = o.transaction_type; // BUY / SELL
      const ts = o.exchange_timestamp || o.order_timestamp;
      const market_type = 1;

      if (txn === "BUY") {
        let remainingToClose = qty;

        // Close SHORT first
        let openShort = await findOpenRow({
          user_id,
          broker_id: broker.id,
          symbol,
          trade_type: 2,
        });

        while (openShort && remainingToClose > 0) {
          const openQty = Number(openShort.entry_quantity);
          const closeQty = Math.min(openQty, remainingToClose);

          await createClosedRowFromSlice({
            openRowSnapshot: openShort.get({ plain: true }),
            closeQty,
            exitPrice: price,
            closeOrderId: orderId,
            ts,
            logicalOrderKey, // <<-- add for grouping/reporting if needed
          });

          await shrinkOpenRow(openShort, closeQty);
          remainingToClose -= closeQty;

          openShort = await findOpenRow({
            user_id,
            broker_id: broker.id,
            symbol,
            trade_type: 2,
          });
        }

        // Remaining opens LONG
        if (remainingToClose > 0) {
          const openLong = await findOpenRow({
            user_id,
            broker_id: broker.id,
            symbol,
            trade_type: 1,
          });

          if (!openLong) {
            await createOpenRow({
              user_id,
              broker_id: broker.id,
              market_type,
              symbol,
              trade_type: 1,
              entryPrice: price,
              qty: remainingToClose,
              order_id: orderId,
              ts,
              logicalOrderKey, // <<-- store grouping key
            });
          } else {
            await averageIntoOpenRow(openLong, remainingToClose, price, orderId, logicalOrderKey);
          }
        }

        processed++;
        continue;
      }

      if (txn === "SELL") {
        let remainingToClose = qty;

        // Close LONG first
        let openLong = await findOpenRow({
          user_id,
          broker_id: broker.id,
          symbol,
          trade_type: 1,
        });

        while (openLong && remainingToClose > 0) {
          const openQty = Number(openLong.entry_quantity);
          const closeQty = Math.min(openQty, remainingToClose);

          await createClosedRowFromSlice({
            openRowSnapshot: openLong.get({ plain: true }),
            closeQty,
            exitPrice: price,
            closeOrderId: orderId,
            ts,
            logicalOrderKey,
          });

          await shrinkOpenRow(openLong, closeQty);
          remainingToClose -= closeQty;

          openLong = await findOpenRow({
            user_id,
            broker_id: broker.id,
            symbol,
            trade_type: 1,
          });
        }

        // Remaining opens SHORT
        if (remainingToClose > 0) {
          const openShort = await findOpenRow({
            user_id,
            broker_id: broker.id,
            symbol,
            trade_type: 2,
          });

          if (!openShort) {
            await createOpenRow({
              user_id,
              broker_id: broker.id,
              market_type,
              symbol,
              trade_type: 2,
              entryPrice: price,
              qty: remainingToClose,
              order_id: orderId,
              ts,
              logicalOrderKey,
            });
          } else {
            await averageIntoOpenRow(openShort, remainingToClose, price, orderId, logicalOrderKey);
          }
        }

        processed++;
        continue;
      }
    }

    res.send(`✅ Zerodha trade sync complete. Processed: ${processed}, Skipped (already applied): ${skipped}`);
  } catch (error) {
    console.error("Zerodha sync error:", error);
    return res.status(500).send("❌ Sync failed: " + error.message);
  }
};

/* --------------------------- Sync holdings --------------------------- */

exports.syncZerodhaHoldings = async (req, res) => {
  const user_id = req.session?.user?.id;
  if (!user_id) return res.status(401).send("Unauthorized");

  try {
    const broker = await Broker.findOne({ where: { name: "Zerodha" } });
    if (!broker) return res.status(400).send("❌ Zerodha broker not found");

    const credentials = await BrokerCredential.findOne({
      where: { user_id, broker_id: broker.id },
    });

    if (!credentials?.api_key || !credentials?.access_token) {
      return res.status(400).send("❌ Zerodha credentials missing");
    }

    const kc = new KiteConnect({ api_key: credentials.api_key });
    kc.setAccessToken(credentials.access_token);

    const holdings = await kc.getHoldings();

    // Clear old holdings
    await Holding.destroy({ where: { user_id, broker_id: broker.id } });
// Usage:
const created_at = getCurrentISTTimestamp();

    for (const h of holdings) {
      await Holding.create({
        user_id,
        broker_id: broker.id,
        market_type: 1, // keep your mapping
        tradingsymbol: h.tradingsymbol,
        exchange: h.exchange,
        instrument_token: h.instrument_token,
        isin: h.isin,
        product: h.product,
        quantity: h.quantity,
        t1_quantity: h.t1_quantity,
        collateral_quantity: h.collateral_quantity,
        average_price: h.average_price,
        last_price: h.last_price,
        pnl: h.pnl,
        market_value: h.market_value,
        day_change: h.day_change ?? 0,
        created_at: created_at,
        updated_at: created_at,
      });
    }

    res.send("✅ Holdings synced successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error syncing Zerodha holdings: " + err.message);
  }
};
