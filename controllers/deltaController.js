// controllers/deltaController.js
const crypto = require('crypto');
const axios = require('axios');
const moment = require('moment');
const { Trade, Broker, BrokerCredential } = require('../models');

// ============ SIGN HELPERS ============

function buildSignature(secret, method, timestamp, path, queryString = '', payload = '') {
  const data = method + timestamp + path + (queryString || '') + (payload || '');
  return {
    signature: crypto.createHmac('sha256', secret).update(data).digest('hex'),
    urlSuffix: queryString ? `?${queryString}` : ''
  };
}

function buildSignatureWithQ(secret, method, timestamp, path, queryString = '', payload = '') {
  const data = method + timestamp + path + (queryString ? `?${queryString}` : '') + (payload || '');
  return {
    signature: crypto.createHmac('sha256', secret).update(data).digest('hex'),
    urlSuffix: queryString ? `?${queryString}` : ''
  };
}

async function signedGet(baseUrl, path, paramsObj, apiKey, secret) {
  const method = 'GET';
  const qs = new URLSearchParams(paramsObj || {}).toString();
  const timestamp = Math.floor(Date.now() / 1000).toString();

  let sig = buildSignature(secret, method, timestamp, path, qs, '');
  let headers = {
    'api-key': apiKey,
    'timestamp': timestamp,
    'signature': sig.signature,
    'Accept': 'application/json'
  };

  try {
    const url = `${baseUrl}${path}${sig.urlSuffix}`;
    return await axios.get(url, { headers });
  } catch (e) {
    const msg = e?.response?.data?.error?.code || e?.response?.data?.message || e.message;
    if (String(msg).toLowerCase().includes('signature mismatch')) {
      const ts2 = Math.floor(Date.now() / 1000).toString();
      const sig2 = buildSignatureWithQ(secret, method, ts2, path, qs, '');
      const headers2 = {
        'api-key': apiKey,
        'timestamp': ts2,
        'signature': sig2.signature,
        'Accept': 'application/json'
      };
      const url2 = `${baseUrl}${path}${sig2.urlSuffix}`;
      return await axios.get(url2, { headers: headers2 });
    }
    throw e;
  }
}

// ============ FETCH & AGGREGATE ============

async function fetchAllFills(baseUrl, apiKey, secret) {
  const path = '/v2/fills';
  const pageSize = 200;
  let after = null;
  const all = [];

  while (true) {
    const params = { page_size: pageSize };
    if (after) params.after = after;

    const r = await signedGet(baseUrl, path, params, apiKey, secret);
    const body = r?.data || {};
    const page = body.result || [];
    const meta = body.meta || {};

    all.push(...page);

    if (meta.after) {
      after = meta.after;
    } else if (meta.next) {
      after = meta.next;
    } else {
      break;
    }
  }

  all.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return all;
}

// ============ TRADE BUILDER ============

function buildTradesFromFills(fills) {
  const bySymbol = new Map();
  fills.forEach(f => {
    const symbol = f.product_symbol || f.symbol;
    if (!symbol) return;
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
    bySymbol.get(symbol).push(f);
  });

  const finished = [];

  for (const [symbol, list] of bySymbol) {
    let posQty = 0;
    let entryQty = 0, entryNotional = 0, avgEntry = 0;
    let exitQty = 0, exitNotional = 0;
    let fees = 0, realized = 0;
    let sideCycle = null;
    let startTs = null, endTs = null;
    let fillIds = [];

    const flush = () => {
      if (posQty === 0 && entryQty > 0 && exitQty > 0) {
        const entryVWAP = entryNotional / entryQty;
        const exitVWAP = exitNotional / exitQty;

        finished.push({
          symbol,
          startTs,
          endTs,
          side: sideCycle,
          qty: entryQty,
          entryVWAP,
          exitVWAP,
          grossPnL: realized,
          fees: Math.abs(fees),
          netPnL: realized - Math.abs(fees),
          fillIds
        });
      }
      entryQty = 0; entryNotional = 0; avgEntry = 0;
      exitQty = 0; exitNotional = 0;
      fees = 0; realized = 0;
      sideCycle = null; startTs = null; endTs = null;
      fillIds = [];
    };

    for (const f of list) {
      const sz = Number(f.size);
      const px = Number(f.price);
      const com = Number(f.commission || 0);
      const side = (f.side || '').toLowerCase();
      const ts = f.created_at;
      const fid = f.id || f.fill_id || null;

      fees += com;
      if (fid) fillIds.push(fid);

      if (posQty === 0) {
        sideCycle = side;
        if (!startTs) startTs = ts;
      }

      if (side === 'buy') {
        if (posQty >= 0) {
          entryNotional += px * sz;
          entryQty += sz;
          avgEntry = entryNotional / entryQty;
          posQty += sz;
        } else {
          const closeQty = Math.min(sz, -posQty);
          realized += (avgEntry - px) * closeQty;
          exitNotional += px * closeQty;
          exitQty += closeQty;
          posQty += closeQty;
          endTs = ts;
          const rem = sz - closeQty;
          if (rem > 0) {
            flush();
            sideCycle = 'buy';
            startTs = ts;
            entryNotional += px * rem;
            entryQty += rem;
            avgEntry = entryNotional / entryQty;
            posQty += rem;
          } else {
            flush();
          }
        }
      } else if (side === 'sell') {
        if (posQty <= 0) {
          entryNotional += px * sz;
          entryQty += sz;
          avgEntry = entryNotional / entryQty;
          posQty -= sz;
        } else {
          const closeQty = Math.min(sz, posQty);
          realized += (px - avgEntry) * closeQty;
          exitNotional += px * closeQty;
          exitQty += closeQty;
          posQty -= closeQty;
          endTs = ts;
          const rem = sz - closeQty;
          if (rem > 0) {
            flush();
            sideCycle = 'sell';
            startTs = ts;
            entryNotional += px * rem;
            entryQty += rem;
            avgEntry = entryNotional / entryQty;
            posQty -= rem;
          } else {
            flush();
          }
        }
      }
    }
  }

  return finished;
}

async function insertIfNotExists(user_id, row) {
  // Use order_id (Delta fill id) for uniqueness
  const exists = await Trade.findOne({
    where: { user_id, order_id: row.order_id }
  });
  if (exists) return false;
  await Trade.create(row);
  return true;
}

function computePnLFromCycle(cycle) {
  const qty = Number(cycle.qty);
  const entry = Number(cycle.entryVWAP);
  const exit = Number(cycle.exitVWAP);
  const fees = Number(Math.abs(cycle.fees || 0));
  const side = (cycle.side || '').toLowerCase();

  let gross = 0;
  if (side === 'buy') gross = (exit - entry) * qty;
  else if (side === 'sell') gross = (entry - exit) * qty;
  else gross = Number(cycle.grossPnL || 0);

  const entryNotional = entry * qty;
  const net = gross - fees;
  const netPct = entryNotional > 0 ? (net / entryNotional) * 100 : 0;

  return { entryNotional, gross, net, fees, netPct };
}

exports.syncDeltaTrades = async (req, res) => {
  const user_id = req.session?.user?.id;
  if (!user_id) return res.status(401).send('❌ Not logged in.');

  try {
    const broker = await Broker.findOne({ where: { name: 'Delta Exchange India' } });
    if (!broker) return res.send("❌ Delta Exchange broker not found.");

    const creds = await BrokerCredential.findOne({ where: { user_id, broker_id: broker.id } });
    if (!creds || !creds.api_key || !creds.secret_key) {
      return res.send("❌ Delta credentials missing. Please connect first.");
    }

    const base = 'https://api.india.delta.exchange';

    // Pull fills
    const fills = await fetchAllFills(base, creds.api_key, creds.secret_key);
    const cycles = buildTradesFromFills(fills);

    let inserted = 0;
    for (const c of cycles) {
      const { entryNotional, gross, net, fees, netPct } = computePnLFromCycle(c);
      const row = {
        user_id,
        market_type: 2,
        broker_id: broker.id,
        symbol: c.symbol,
        datetime: moment(c.endTs).format('YYYY-MM-DD'),
        entry_price: Number(c.entryVWAP.toFixed(4)),
        entry_quantity: Number(c.qty),
        entry_amount: Number(entryNotional.toFixed(4)),
        exit_price: Number(c.exitVWAP.toFixed(4)),
        trade_type: (c.side || '').toLowerCase() === 'buy' ? 1 : 2,
        stop_loss: 0,
        target: 0,
        strategy_id: 1,
        outcome_summary_id: 1,
        rationale: '',
        rules_followed: '',
        leverage: 10,
        margin_used: 0,
        pnl_amount: Number((net / 85).toFixed(2)),   // ✅ keep /85
        pnl_percent: Number(netPct.toFixed(2)),
        order_id: (c.fillIds && c.fillIds.length ? c.fillIds.join(',') : null), // unique fill ids
        brokerage: fees,
        created_at: c.startTs,
        updated_at: moment().format('YYYY-MM-DD HH:mm:ss')
      };
      const ok = await insertIfNotExists(user_id, row);
      if (ok) inserted++;
    }

    return res.send(`✅ Delta sync complete. Cycles: ${cycles.length}, Inserted: ${inserted}`);
  } catch (err) {
    console.error('❌ Delta sync failed:', err?.response?.data || err.message);
    return res.send('❌ Delta sync failed: ' + (err?.response?.data?.message || err.message));
  }
};
