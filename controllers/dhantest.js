// controllers/dhan.js
var dc = require("dhanhq");
const axios = require("axios");
const dotenv = require("dotenv");
const moment = require("moment");

dotenv.config();

const { Holding, Broker } = require("../models");

// ================= TOKENS / IDS =================
const ACCESS_TOKEN      = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpc3MiOiJkaGFuIiwicGFydG5lcklkIjoiIiwiZXhwIjoxNzU5NTAzNTk4LCJpYXQiOjE3NTY5MTE1OTgsInRva2VuQ29uc3VtZXJUeXBlIjoiU0VMRiIsIndlYmhvb2tVcmwiOiIiLCJkaGFuQ2xpZW50SWQiOiIxMTA0MTA5OTY0In0.UWSfJGgRJTZTyBCwVDObbx0RN9SJ1mr1MMt5dNUzeJFnMJi8bEq57LdJ1vqlqROlXHOU8818tvvq35LYsWumOA';
const DHAN_CLIENT_ID    = '1104109964';

const DATA_ACCESS_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpc3MiOiJkaGFuIiwicGFydG5lcklkIjoiIiwiZXhwIjoxNzU5NTA2MjgwLCJpYXQiOjE3NTY5MTQyODAsInRva2VuQ29uc3VtZXJUeXBlIjoiU0VMRiIsIndlYmhvb2tVcmwiOiIiLCJkaGFuQ2xpZW50SWQiOiIxMTAzMDU5NTQwIn0.PEpS0bxEwEZi0hZTQrjkmQN-gMd5zxSMIKeTh1i6RHIpurpm0FmBtaAKTBI_w_OF1wZVpouTaqkCgVpjNubybw';
const DHAN_DATA_CLIENT_ID    = '1103059540';

// --- derive DATA client id from JWT (helps avoid 401) ---
function getClientIdFromJwt(jwt) {
  try {
    const [, payloadB64] = jwt.split(".");
    const json = Buffer.from(payloadB64, "base64").toString("utf8");
    const p = JSON.parse(json);
    return p.dhanClientId || p.dhanClientID || p.clientId || p.clientID || null;
  } catch {
    return null;
  }
}
const DATA_CLIENT_ID =
  getClientIdFromJwt(DATA_ACCESS_TOKEN) ||
  process.env.DHAN_DATA_CLIENT_ID ||
  DHAN_DATA_CLIENT_ID;

// ================ DHAN SDK CLIENT =================
const client = new dc.DhanHqClient({
  accessToken: ACCESS_TOKEN,
  env: "PROD",
});

// ============== Helpers =============
const SEGMENT_MAP = {
  NSE: "NSE_EQ",
  BSE: "BSE_EQ",
  MCX: "MCX",
  NSE_EQ: "NSE_EQ",
  BSE_EQ: "BSE_EQ",
  NSE_FNO: "NSE_FNO",
  BSE_FNO: "BSE_FNO",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const n = (v) => Number(v ?? 0) || 0;

function uniq(arr) { return Array.from(new Set(arr)); }

// ===== Axios (Data APIs) =====
const dataApi = axios.create({
  baseURL: "https://api.dhan.co/v2",
  timeout: 10000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    "access-token": DATA_ACCESS_TOKEN,
    "client-id": String(DATA_CLIENT_ID || ""),
  },
});

async function postWithRetry(url, body, { maxRetries = 3, baseDelayMs = 600 } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await dataApi.post(url, body);
    } catch (err) {
      const status = err.response?.status;
      attempt++;
      if (status === 401) throw err; // bad token/client-id: fail fast
      if ((status === 429 || (status >= 500 && status < 600)) && attempt <= maxRetries) {
        const delay = baseDelayMs * attempt;
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
}

// ---------- Build payloads ----------
function buildOhlcPayload(holdings) {
  const payload = {};
  const add = (seg, id) => {
    if (!seg || !id) return;
    if (!payload[seg]) payload[seg] = [];
    payload[seg].push(id);
  };
  for (const h of holdings) {
    const id = n(h.securityId);
    if (!id) continue;
    const exch = String(h.exchange || "").toUpperCase();
    if (exch === "ALL" || !SEGMENT_MAP[exch]) {
      add("NSE_EQ", id);
      add("BSE_EQ", id);
    } else {
      add(SEGMENT_MAP[exch], id);
    }
  }
  for (const seg of Object.keys(payload)) payload[seg] = uniq(payload[seg]);
  return payload;
}

// ---------- Step 1: Current last_price (and pick winning segment) ----------
/**
 * Returns:
 *  - lastMap:  Map key `${seg}:${id}` -> { last_price }
 *  - chosenSegById: Map key `${id}` -> 'NSE_EQ' | 'BSE_EQ' | 'MCX' (segment that returned a non-zero price first)
 */
async function fetchAllCurrentLast(holdings) {
  const body = buildOhlcPayload(holdings);
  const lastMap = new Map();
  const chosenSegById = new Map();

  for (const [seg, ids] of Object.entries(body)) {
    try {
      const { data } = await postWithRetry("/marketfeed/ohlc", { [seg]: ids });
      const segData = data?.data?.[seg] || {};
      for (const id of ids) {
        const node = segData?.[String(id)] ?? segData?.[id];
        const last = n(node?.last_price);
        lastMap.set(`${seg}:${id}`, { last_price: last });
        if (last > 0 && !chosenSegById.has(String(id))) {
          chosenSegById.set(String(id), seg); // remember which segment actually worked
        }
      }
      await sleep(150); // be nice to API
    } catch (err) {
      // mark zeros for this segment
      for (const id of ids) {
        if (!lastMap.has(`${seg}:${id}`)) lastMap.set(`${seg}:${id}`, { last_price: 0 });
      }
    }
  }
  return { lastMap, chosenSegById };
}

// ---------- Step 2: Prev close from Historical (yesterday) ----------
/**
 * Only call historical for the **chosen segment** per id (avoid BSE if NSE worked, etc).
 * If a request 400s (DH-905), try the alternate segment once.
 */
async function fetchPrevCloseMap(chosenSegById) {
  const out = new Map();

  // Group ids by chosen segment
  const perSeg = {};
  for (const [id, seg] of chosenSegById.entries()) {
    if (!perSeg[seg]) perSeg[seg] = [];
    perSeg[seg].push(Number(id));
  }

  // Helper to build body
  const instrumentForSeg = (seg) => {
    if (seg === "NSE_EQ" || seg === "BSE_EQ") return "EQUITY";
    if (seg === "MCX") return "COMMODITY";
    return "EQUITY";
  };

  const fromDate = moment().subtract(15, "days").format("YYYY-MM-DD");
  const toDate   = moment().format("YYYY-MM-DD"); // non-inclusive (up to yesterday)
  const INTERVAL = "1DAY";

  for (const [seg, ids] of Object.entries(perSeg)) {
    for (const id of ids) {
      const body = {
        securityId: String(id),
        exchangeSegment: seg,
        instrument: instrumentForSeg(seg),
        expiryCode: 0,
        interval: INTERVAL,
        fromDate,
        toDate
      };

      let prevClose = 0;
      try {
        const { data } = await postWithRetry("/charts/historical", body);
        const closes = Array.isArray(data?.close) ? data.close : [];
        prevClose = closes.length ? n(closes[closes.length - 1]) : 0;
      } catch (err) {
        const status = err.response?.status;
        // If this segment failed, try alternate once for equities
        if ((seg === "BSE_EQ" || seg === "NSE_EQ")) {
          const altSeg = seg === "BSE_EQ" ? "NSE_EQ" : "BSE_EQ";
          const altBody = { ...body, exchangeSegment: altSeg, instrument: instrumentForSeg(altSeg) };
          try {
            const { data } = await postWithRetry("/charts/historical", altBody);
            const closes = Array.isArray(data?.close) ? data.close : [];
            prevClose = closes.length ? n(closes[closes.length - 1]) : 0;
          } catch (e2) {
            prevClose = 0; // give up: will result in 0% change
          }
        } else {
          prevClose = 0;
        }
      }

      out.set(`${seg}:${id}`, prevClose);
      await sleep(120);
    }
  }

  return out;
}

// ================== Main Export ==================
exports.fetchDhanData = async (req, res) => {
  const user_id = req.session.user.id;

  try {
    // 1) Broker id
    const broker = await Broker.findOne({ where: { name: "Dhan" } });
    if (!broker) {
      return res.status(404).json({ success: false, message: "Dhan broker not found in DB" });
    }

    // 2) Get portfolio + funds + positions from Trading APIs
    const holdings  = await client.getHoldings();
    const funds     = await client.getFundLimit();
    const positions = await client.getPositions();

    if (!Array.isArray(holdings)) {
      console.error("⚠️ holdings is not an array:", holdings);
    }

    // 3) Fetch current last & choose working segment per id
    const { lastMap, chosenSegById } = await fetchAllCurrentLast(holdings);

    // 4) Fetch previous daily close only for chosen segment (with fallback)
    const prevCloseMap = await fetchPrevCloseMap(chosenSegById);

    // 5) Clean previous holdings for this user/broker
    await Holding.destroy({ where: { user_id, broker_id: broker.id } });

    // 6) Save holdings with last_price + day_change% + pnl
    let saved = 0;
    for (const h of holdings) {
      const secIdStr     = String(n(h.securityId));
      const qty          = n(h.totalQty);
      const avgCostPrice = n(h.avgCostPrice);

      // Segment we actually saw prices on; if none, try NSE then BSE
      let seg = chosenSegById.get(secIdStr) || "NSE_EQ";
      if (!lastMap.get(`${seg}:${secIdStr}`) && lastMap.get(`BSE_EQ:${secIdStr}`)) {
        seg = "BSE_EQ";
      }

      const last_price = n(lastMap.get(`${seg}:${secIdStr}`)?.last_price);
      // Use prevClose from the chosen segment; if 0, also try alternate seg map
      let prev_close = n(prevCloseMap.get(`${seg}:${secIdStr}`));
      if (!prev_close) {
        const altSeg = seg === "NSE_EQ" ? "BSE_EQ" : "NSE_EQ";
        prev_close = n(prevCloseMap.get(`${altSeg}:${secIdStr}`));
      }

      const day_change = prev_close ? ((last_price - prev_close) / prev_close) * 100 : 0;

      const apiPnL   = n(h.totalPnL);
      const calcPnL  = (last_price - avgCostPrice) * qty;
      const pnl      = apiPnL !== 0 ? apiPnL : calcPnL;

      await Holding.create({
        user_id,
        broker_id: broker.id,
        market_type: 1,
        tradingsymbol: h.tradingSymbol,
        exchange: h.exchange, // 'ALL'/'NSE'/'BSE'/'MCX'
        quantity: qty,
        isin: h.isin,
        average_price: avgCostPrice,
        last_price,
        market_value: h.currentValue ?? (last_price * qty),
        pnl,
        day_change, // percentage vs yesterday's close
        created_at: moment().format(),
        updated_at: moment().format(),
      });
      saved++;
    }

    return res.json({
      success: true,
      message: `✅ Synced ${saved} holdings (day_change% via historical; segment-aware)`,
      data: { holdings, funds, positions },
    });
  } catch (err) {
    console.error("❌ Dhan API Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch or sync Dhan data",
      error: err.message || String(err),
    });
  }
};
