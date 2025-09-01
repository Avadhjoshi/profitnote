const { SmartAPI } = require("smartapi-javascript");
const moment = require("moment");
const { authenticator } = require("otplib");
const { Broker, BrokerCredential, Trade, Holding } = require("../models");
const axios = require("axios");
const { Op, Sequelize } = require("sequelize");


// normalize common Angel symbol variants -> a small helper
function stripSuffix(sym = "") {
  // remove common series suffixes once: -EQ, -BE, -BZ, -P*, -PP, -DVR, etc.
  return sym.replace(/-(EQ|BE|BZ|BL|PP|P\d+|DVR)$/i, "");
}

exports.updateMissingLTPFromAngel = async (req, res) => {
  const user_id = req.session.user?.id;
  if (!user_id) return res.status(401).send("Unauthorized");

  try {
    // credentials
    const creds = await BrokerCredential.findOne({ where: { user_id } });
    if (!creds || !creds.access_token || !creds.api_key) {
      return res.status(400).send("❌ Missing Angel One credentials.");
    }

    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-UserType": "USER",
      "X-SourceID": "WEB",
      "X-ClientLocalIP": "127.0.0.1",
      "X-ClientPublicIP": "127.0.0.1",
      "X-MACAddress": "00:11:22:33:44:55",
      "X-PrivateKey": creds.api_key,
      Authorization: `Bearer ${creds.access_token}`,
    };

    // holdings needing LTP
    const holdings = await Holding.findAll({
      where: { last_price: 0 },
      // If you want per-user only:
      // where: { user_id, last_price: 0 },
    });
    if (!holdings.length) return res.send("✅ No holdings with 0 last_price found.");

    // Build exchangeTokens using symbol-only mapping from angel_scrip_master
    const exchangeTokens = { NSE: [], BSE: [] };
    const tokenToHoldingIds = {}; // token -> array of holding ids
    const dedupe = new Set();

    for (const h of holdings) {
      const rawSymbol = (h.tradingsymbol || "").trim();
      if (!rawSymbol) continue;

      // prefer existing instrument_token if already set
      let token = h.instrument_token;
      let seg = null;

      if (!token) {
        const base = stripSuffix(rawSymbol);

        // Try: exact, -EQ, -BE (prefer NSE via ORDER BY)
        let rows = await Holding.sequelize.query(
          `SELECT token, exch_seg 
           FROM angel_scrip_master
           WHERE symbol IN (?, ?, ?)
           ORDER BY FIELD(exch_seg,'NSE','BSE') DESC
           LIMIT 1`,
          {
            replacements: [rawSymbol, `${base}-EQ`, `${base}-BE`],
            type: Sequelize.QueryTypes.SELECT,
          }
        );

        // Fallback: if no exact/variant, try LIKE on base (rare but helps mismatches)
        if (!rows?.length) {
          rows = await Holding.sequelize.query(
            `SELECT token, exch_seg
             FROM angel_scrip_master
             WHERE symbol LIKE CONCAT(?, '%')
             ORDER BY FIELD(exch_seg,'NSE','BSE') DESC
             LIMIT 1`,
            {
              replacements: [base],
              type: Sequelize.QueryTypes.SELECT,
            }
          );
        }

        if (rows?.length) {
          token = rows[0].token;
          seg = (rows[0].exch_seg || "NSE").toUpperCase();
        }
      } else {
        // have token; fetch its exch_seg once
        const rows = await Holding.sequelize.query(
          `SELECT exch_seg FROM angel_scrip_master WHERE token = ? LIMIT 1`,
          { replacements: [token], type: Sequelize.QueryTypes.SELECT }
        );
        seg = (rows?.[0]?.exch_seg || "NSE").toUpperCase();
      }

      if (!token || !seg) {
        // console.warn(`No token found for symbol=${rawSymbol}`);
        continue;
      }

      if (!dedupe.has(`${seg}:${token}`)) {
        if (!exchangeTokens[seg]) exchangeTokens[seg] = [];
        exchangeTokens[seg].push(String(token));
        dedupe.add(`${seg}:${token}`);
      }

      if (!tokenToHoldingIds[token]) tokenToHoldingIds[token] = [];
      tokenToHoldingIds[token].push(h.id);
    }

    // prune empty
    Object.keys(exchangeTokens).forEach((k) => {
      if (!exchangeTokens[k]?.length) delete exchangeTokens[k];
    });

    if (!Object.keys(exchangeTokens).length) {
      return res.status(400).send("❌ No tokens resolved from angel_scrip_master (symbol mapping failed).");
    }

    // Bulk quote
    const quoteRes = await axios.post(
      "https://apiconnect.angelone.in/rest/secure/angelbroking/market/v1/quote/",
      { mode: "LTP", exchangeTokens },
      { headers, timeout: 15000 }
    );

    const fetched = quoteRes.data?.data?.fetched || [];
    const unfetched = quoteRes.data?.data?.unfetched || [];
    // console.log("Fetched:", fetched.length, "Unfetched:", unfetched?.length || 0);

    if (!fetched.length) {
      return res.status(400).send("❌ No quotes returned (tokens may be invalid or rate-limited).");
    }

    let updatedCount = 0;

    for (const item of fetched) {
      const token =
        String(item.symbolToken ?? item.symboltoken ?? item.token ?? "");
      const ltp = Number(item.ltp);
      if (!token || !ltp) continue;

      const ids = tokenToHoldingIds[token] || [];
      for (const id of ids) {
        const h = holdings.find((x) => x.id === id);
        if (!h) continue;

        const avg = Number(h.average_price || 0);
        const qty = Number(h.quantity || 0);
        const pnl = (ltp - avg) * qty;

        await Holding.update(
          {
            instrument_token: token,
            last_price: ltp.toFixed(2),
            pnl: pnl.toFixed(2),
            updated_at: moment().format("YYYY-MM-DD HH:mm:ss"),
          },
          { where: { id } }
        );
        updatedCount++;
      }
    }

    return res.send(`✅ Updated ${updatedCount} holdings using SmartAPI bulk LTP (symbol-only mapping).`);
  } catch (err) {
    console.error("❌ LTP Bulk Update Error:", err.response?.data || err.message);
    return res
      .status(500)
      .send("❌ Failed to update: " + (err.response?.data?.message || err.message));
  }
};

// 📥 Sync Angel Scrip Master JSON to MySQL
exports.syncAngelScripMaster = async (req, res) => {
  const axios = require("axios");
  const { Sequelize } = require("sequelize");
  const db = require("../models"); // or wherever your sequelize models live

  try {
    const { data } = await axios.get(
      "https://profitnote.acutetech.in/uploads/scrips.json"
    );

    if (!Array.isArray(data)) {
      return res.status(400).send("Invalid ScripMaster JSON format");
    }

    const connection = await db.sequelize; // sequelize connection
    const now = new Date();

    for (const item of data) {
      await connection.query(
        `
        INSERT INTO angel_scrip_master 
        (token, symbol, name, expiry, strike, lotsize, instrumenttype, exch_seg, tick_size, isin)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          symbol = VALUES(symbol),
          name = VALUES(name),
          expiry = VALUES(expiry),
          strike = VALUES(strike),
          lotsize = VALUES(lotsize),
          instrumenttype = VALUES(instrumenttype),
          exch_seg = VALUES(exch_seg),
          tick_size = VALUES(tick_size),
          isin = VALUES(isin)
        `,
        {
          replacements: [
            parseInt(item.token),
            item.symbol || null,
            item.name || null,
            item.expiry || null,
            item.strike || 0,
            item.lotsize || 0,
            item.instrumenttype || null,
            item.exch_seg || null,
            item.tick_size || 0,
            item.isin || null
          ],
          type: Sequelize.QueryTypes.INSERT
        }
      );
    }

    return res.send(`✅ Scrip Master sync complete. ${data.length} records processed.`);
  } catch (err) {
    console.error("❌ Scrip Master Sync Error:", err.message || err);
    return res.status(500).send("❌ Failed to sync scrip master: " + err.message);
  }
};

// Fetch broker credentials for Angel One
const getAngelCredentials = async (user_id) => {
  const broker = await Broker.findOne({ where: { name: "Angel One" } });
  if (!broker) throw new Error("Angel broker not found.");

  const credentials = await BrokerCredential.findOne({
    where: { user_id, broker_id: broker.id },
  });
  if (!credentials) throw new Error("Angel credentials not found.");

  return { brokerId: broker.id, ...credentials.dataValues };
};

// 🔗 Redirect user to Angel login page (manual login flow)
exports.redirectToAngelLogin = async (req, res) => {
  const user_id = req.session.user?.id;
  if (!user_id) return res.status(401).send("Unauthorized");

  try {
    const { api_key, client_id, callback_url } = await getAngelCredentials(user_id);

    const loginUrl = `https://smartapi.angelbroking.com/publisher-login?api_key=${api_key}&client_code=${client_id}&redirect_uri=${callback_url}`;
    return res.redirect(loginUrl);
  } catch (error) {
    console.error("Angel redirect error:", error.message);
    return res.status(400).send("❌ Redirect failed: " + error.message);
  }
};

// 🔁 Callback after manual login (store tokens from URL)
exports.handleAngelCallback = async (req, res) => {
  const user_id = req.session.user?.id;
  const { auth_token, refresh_token, feed_token } = req.query;

  try {
    const { brokerId } = await getAngelCredentials(user_id);

    if (!auth_token || !refresh_token || !feed_token) {
      return res.status(400).send("Missing tokens in callback URL");
    }

    await BrokerCredential.update(
      {
        access_token: auth_token,
        refresh_token,
        feed_token,
        updated_at: moment().format("YYYY-MM-DD HH:mm:ss"),
      },
      { where: { user_id, broker_id: brokerId } }
    );

    return res.redirect("/credentials?success=✅ Angel One connected successfully");
  } catch (err) {
    console.error("🔴 Angel callback error:", err);
    return res.status(500).send("Callback failed: " + err.message);
  }
};


exports.syncAngelTrades = async (req, res) => {
  const user_id = req.session.user?.id;
  if (!user_id) return res.status(401).send("Unauthorized");

  try {
    const {
      client_id,
      pin,
      api_key,
      totp_secret,
      brokerId
    } = await getAngelCredentials(user_id);

    if (!client_id || !pin || !totp_secret || !api_key) {
      return res.status(400).send("❌ Missing Angel One credentials.");
    }

    const totp = authenticator.generate(totp_secret);

    // Login to Angel One
    const loginResponse = await axios.post(
      "https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword",
      {
        clientcode: client_id,
        password: pin,
        totp: totp,
        state: "xyz"
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-UserType": "USER",
          "X-SourceID": "WEB",
          "X-ClientLocalIP": "127.0.0.1",
          "X-ClientPublicIP": "127.0.0.1",
          "X-MACAddress": "00:11:22:33:44:55",
          "X-PrivateKey": api_key
        }
      }
    );

    const session = loginResponse.data;
    if (!session?.data?.jwtToken) {
      throw new Error("❌ No access token received.");
    }

    const access_token = session.data.jwtToken;

    // Save tokens
    await BrokerCredential.update(
      {
        access_token,
        refresh_token: session.data.refresh_token,
        feed_token: session.data.feed_token,
        updated_at: moment().format("YYYY-MM-DD HH:mm:ss")
      },
      { where: { user_id, broker_id: brokerId } }
    );

    // Fetch completed orders
    const orderResponse = await axios.get(
      "https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/getOrderBook",
      {
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-UserType": "USER",
          "X-SourceID": "WEB",
          "X-ClientLocalIP": "127.0.0.1",
          "X-ClientPublicIP": "127.0.0.1",
          "X-MACAddress": "00:11:22:33:44:55",
          "X-PrivateKey": api_key,
          Authorization: `Bearer ${access_token}`
        }
      }
    );

    const completedOrders = Array.isArray(orderResponse.data?.data)
      ? orderResponse.data.data.filter(o => o.orderstatus === "complete")
      : [];

    console.log(`✅ ${completedOrders.length} completed orders fetched`);

    // Group orders by symbol
    const ordersBySymbol = {};
    for (const order of completedOrders) {
      const key = order.tradingsymbol;
      if (!ordersBySymbol[key]) ordersBySymbol[key] = [];
      ordersBySymbol[key].push(order);
    }

    // Process each symbol
    for (const [symbol, orders] of Object.entries(ordersBySymbol)) {
      const buys = orders.filter(o => o.transactiontype === 'BUY');
      const sells = orders.filter(o => o.transactiontype === 'SELL');

      const entryQty = buys.reduce((sum, o) => sum + parseFloat(o.filledshares), 0);
      const entryValue = buys.reduce((sum, o) => sum + parseFloat(o.filledshares) * parseFloat(o.averageprice), 0);
      const entryPrice = entryQty > 0 ? entryValue / entryQty : 0;

      const exitQty = sells.reduce((sum, o) => sum + parseFloat(o.filledshares), 0);
      const exitValue = sells.reduce((sum, o) => sum + parseFloat(o.filledshares) * parseFloat(o.averageprice), 0);
      const exitPrice = exitQty > 0 ? exitValue / exitQty : 0;

      const minQty = Math.min(entryQty, exitQty);
      const pnl = (exitPrice - entryPrice) * minQty;

      const status =
        exitQty === 0 ? 'open' :
        exitQty < entryQty ? 'partial' : 'closed';

        const entryTime = buys.length > 0 ? buys[0].exchorderupdatetime : null;
        const exitTime = sells.length > 0 ? sells[sells.length - 1].exchorderupdatetime : null;
        const datetime=moment(buys[0].exchorderupdatetime, "DD-MMM-YYYY HH:mm:ss").format("YYYY-MM-DD HH:mm:ss");
     
      const order_id = buys[0].orderid || buys[0].exchangereferenceid;

  // Check if trade with same order_id already exists
  const existing = await Trade.findOne({ where: { user_id, order_id } });
  if (existing) continue;

      // Save to tbl_trades
      await Trade.upsert({
        user_id,
        broker_id: brokerId,
        symbol,
        entry_price: entryPrice.toFixed(2),
        entry_quantity: entryQty,
        exit_price: exitPrice.toFixed(2),
        exit_quantity: exitQty,
        pnl_amount: pnl.toFixed(2),
        status,
        datetime,
        created_at:entryTime,
        //exit_time,
        market_type: 1,
        order_id,
        created_at: moment().format("YYYY-MM-DD HH:mm:ss"),
        updated_at: moment().format("YYYY-MM-DD HH:mm:ss")
      });
    }

    return res.send("✅ Angel One trades synced and journaled.");
  } catch (error) {
    console.error("❌ Angel Trade Sync Error:", error.response?.data || error.message);
    return res.status(500).send("❌ Trade sync failed: " + (error.response?.data?.message || error.message));
  }
};
// 📈 Sync Angel Holdings
exports.syncAngelHoldings = async (req, res) => {
  const user_id = req.session.user?.id;
  if (!user_id) return res.status(401).send("Unauthorized");

  try {
    const { api_key, access_token, brokerId } = await getAngelCredentials(user_id);
    const smartApi = new SmartAPI({ api_key });
    smartApi.setAccessToken(access_token);

    const holdingsRes = await smartApi.getHolding();
    const holdings = holdingsRes.data || [];

    // Clear old holdings
    await Holding.destroy({ where: { user_id, broker_id: brokerId } });

    const now = moment().format("YYYY-MM-DD HH:mm:ss");

    for (const h of holdings) {
      await Holding.create({
        user_id,
        broker_id: brokerId,
        market_type: 1,
        tradingsymbol: h.tradingsymbol,
        exchange: h.exchange,
        quantity: h.quantity,
        average_price: h.averageprice,
        last_price: h.ltp,
        product: h.producttype,
        isin: h.isin,
        pnl: h.pnl,
        market_value: h.amount,
        created_at: now,
        updated_at: now,
      });
    }

    return res.send("✅ Angel holdings synced successfully");
  } catch (err) {
    console.error("Angel Holding Sync Error:", err.message || err);
    return res.status(500).send("❌ Holding sync failed: " + err.message);
  }
};
