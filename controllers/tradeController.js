const fs = require('fs');
const path = require('path');
const moment = require('moment');
const { Op, fn, col, literal } = require('sequelize');


const {
  Trade,
  Strategy,
  Emotion,
  OutcomeSummary,
  Rule,
  MarketCategory,
  Broker,
  Mistake,
  TradeScreenshot,
  TvTradeSignal
} = require('../models');

exports.listTrades = async (req, res) => {
  try {
    const user_id = req.session.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    // Filters
    const market = parseInt(req.query.market) || 1;
    const month = req.query.month !== undefined ? parseInt(req.query.month) : moment().month();
    const year = parseInt(req.query.year) || moment().year();
    const strategyId = req.query.strategy_id ? parseInt(req.query.strategy_id) : null;
    const specificDate = req.query.date ? moment(req.query.date, 'YYYY-MM-DD').toDate() : null;

    // Build dynamic WHERE clause
    const where = {
      user_id,
      market_type: market
    };

    if (specificDate) {
      where.datetime = {
        [Op.gte]: moment(specificDate).startOf('day').toDate(),
        [Op.lte]: moment(specificDate).endOf('day').toDate()
      };
    } else {
      const startOfMonth = moment({ year, month, day: 1 }).startOf('month').toDate();
      const endOfMonth = moment({ year, month, day: 1 }).endOf('month').toDate();
      where.datetime = { [Op.between]: [startOfMonth, endOfMonth] };
    }

    if (strategyId) {
      where.strategy_id = strategyId;
    }

    const { count, rows: trades } = await Trade.findAndCountAll({
      where,
      include: [
        { model: Strategy, as: 'Strategy' },
        { model: OutcomeSummary, as: 'Outcome' }
      ],
      order: [['id', 'DESC']],
      limit,
      offset
    });

    const marketList = await MarketCategory.findAll({ attributes: ['id', 'market_name'] });

    res.render('trades/list', {
      trades,
      moment,
      activePage: 'trades',
      marketList,
      market,
      month,
      year,
      strategyId,
      date: req.query.date || '',
      currentPage: page,
      totalPages: Math.ceil(count / limit),
      showingStart: offset + 1,
      showingEnd: Math.min(offset + limit, count),
      totalCount: count
    });

  } catch (err) {
    console.error('Error loading trades:', err);
    res.status(500).send('Internal Server Error');
  }
};

// ✅ Render Add Form
exports.renderAddTrade = async (req, res) => {
  try {
    const strategies = await Strategy.findAll();
    const emotions = await Emotion.findAll();
    const summaries = await OutcomeSummary.findAll();
    const rules = await Rule.findAll();
    const markets = await MarketCategory.findAll();
    const brokers = await Broker.findAll();
   const mistakes = await Mistake.findAll();

    res.render('trades/add', {
      activePage: 'trades',
      strategies,
      emotions,
      summaries,
      rules,
      markets,
      brokers,
      mistakes
    });
  } catch (err) {
    console.error('Error rendering add form:', err);
    res.status(500).send('Internal Server Error');
  }
};

exports.saveTrade = async (req, res) => {
  try {
    const {
      market_type, broker_id, datetime, symbol, trade_type,
      entry_price, entry_quantity, leverage, margin_used,
      stop_loss, target, exit_price, pnl_amount, pnl_percent,
      strategy_id, outcome_summary_id, rationale,
      emotion_id, confidence_level, satisfaction_level,brokerage,
      lessons
    } = req.body;
    
    const rules_followed = req.body['rules_followed[]'] || [];
    const mistakes = req.body['mistakes[]'] || [];
    
    let screenshotsRaw = req.body['screenshots[]'];
    let screenshots = [];
    
    if (typeof screenshotsRaw === 'string') {
      screenshots = screenshotsRaw.split('||');
    } else if (Array.isArray(screenshotsRaw)) {
      screenshots = screenshotsRaw;
    }

    const user_id = req.session.user.id;
    const formattedDatetime = moment(datetime, 'DD/MM/YYYY').format('YYYY-MM-DD');
    const created_at = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    const trade = await Trade.create({
      user_id,
      market_type,
      broker_id,
      datetime:formattedDatetime,
      symbol,
      trade_type,
      entry_price,
      entry_quantity,
      leverage,
      margin_used,
      stop_loss,
      target,
      exit_price,
      pnl_amount,
      pnl_percent,
      strategy_id,
      outcome_summary_id,
      rationale,
      emotion_id,
      confidence_level,
      satisfaction_level,
       lesson:lessons,
      screenshots: Array.isArray(screenshots) ? screenshots.join(',') : screenshots,
      created_at,
      margin_used,
      leverage,
      brokerage
    });

    if (trade && typeof trade.setRules_followed === 'function') {
      await trade.setRules_followed(rules_followed);
    }

    if (trade && typeof trade.setMistakes === 'function') {
      await trade.setMistakes(mistakes);
    }
    
 if (Array.isArray(req.files) && req.files.length > 0) {
      for (const file of req.files) {
        await TradeScreenshot.create({
          trade_id: trade.id,
          filename: file.filename
        });
      }
    }    return res.status(200).json({ success: true, message: 'Trade saved successfully!' });
  } catch (error) {
    console.error('❌ Error saving trade:', error);
    return res.status(500).json({ success: false, message: 'Failed to save trade.' });
  }
};

// ✅ Render Edit Form
exports.renderEditTrade = async (req, res) => {
  try {
    const id = req.params.id;
    const trade = await Trade.findByPk(id);

    if (!trade) return res.status(404).send('Trade not found');

    const strategies = await Strategy.findAll();
    const emotions = await Emotion.findAll();
    const summaries = await OutcomeSummary.findAll();
    const rules = await Rule.findAll();
    const markets = await MarketCategory.findAll();
    const brokers = await Broker.findAll();
    const mistakes = await Mistake.findAll();
    const screenshots = await TradeScreenshot.findAll({
      where: { trade_id: id }
    });
    
  
    // Parse comma-separated fields to arrays
    trade.rules_followed = trade.rules_followed ? trade.rules_followed.split(',').map(Number) : [];
    trade.mistakes = trade.mistakes ? trade.mistakes.split(',').map(Number) : [];
    trade.screenshots = trade.screenshots ? JSON.parse(trade.screenshots) : [];
const moment = require('moment');

    res.render('trades/edit', {
      activePage: 'trades',
      strategies,
      emotions,
      summaries,
      rules,
      markets,
      brokers,
      mistakes,
      trade,
      screenshots,
      moment
    });

  } catch (err) {
    console.error('Error rendering edit form:', err);
    res.status(500).send('Internal Server Error');
  }
};

exports.updateTrade = async (req, res) => {
  
  try {
    const tradeId = req.params.id;
    const trade = await Trade.findByPk(tradeId);

    if (!trade) {
      return res.status(404).json({ success: false, message: 'Trade not found.' });
    }

    const {
      market_type, broker_id, datetime, symbol, trade_type,
      entry_price, entry_quantity, leverage, margin_used,
      stop_loss, target, exit_price, pnl_amount, pnl_percent,
      strategy_id, outcome_summary_id, rationale,
      emotion_id, confidence_level, satisfaction_level,brokerage,
      lessons
    } = req.body;

let rules_followed = req.body['rules_followed[]'] || req.body.rules_followed || [];
let mistakes = req.body['mistakes[]'] || req.body.mistakes || [];

if (!Array.isArray(rules_followed)) rules_followed = [rules_followed];
if (!Array.isArray(mistakes)) mistakes = [mistakes];

    // Screenshots from hidden field (for previously uploaded ones)
    let screenshotsRaw = req.body['screenshots[]'];
    let screenshots = [];

    if (typeof screenshotsRaw === 'string') {
      screenshots = screenshotsRaw.split('||');
    } else if (Array.isArray(screenshotsRaw)) {
      screenshots = screenshotsRaw;
    }
  console.error('🛠 Update Payload:', {
  market_type,
  broker_id,
  datetime,
  symbol,
  trade_type,
  entry_price,
  entry_quantity,
  leverage,
  margin_used,
  stop_loss,
  target,
  exit_price,
  pnl_amount,
  pnl_percent,
  strategy_id,
  outcome_summary_id,
  rationale,
  emotion_id,
  confidence_level,
  satisfaction_level,
  lessons,
  rules_followed,
  brokerage,
  screenshots: Array.isArray(screenshots) ? screenshots.join(',') : screenshots
});
const formattedDatetime = moment(datetime, 'DD/MM/YYYY').format('YYYY-MM-DD');

    // Update the trade record
    await trade.update({
      market_type,
      broker_id,
      datetime:formattedDatetime,
      symbol,
      trade_type,
      entry_price,
      entry_quantity,
      leverage,
      margin_used,
      stop_loss,
      target,
      exit_price,
      pnl_amount,
      pnl_percent,
      strategy_id,
      outcome_summary_id,
      rationale,
      emotion_id,
      confidence_level,
      satisfaction_level,
      lesson:lessons,
     rules_followed: rules_followed.join(','), // converts [1, 2] → "1,2"
      mistakes: mistakes.join(','),
      screenshots: Array.isArray(screenshots) ? screenshots.join(',') : screenshots,
      updated_at: new Date().toISOString(),
      margin_used,
      leverage,
      brokerage
    
    });

 
    // Newly uploaded screenshot files
    if (Array.isArray(req.files) && req.files.length > 0) {
      for (const file of req.files) {
        await TradeScreenshot.create({
          trade_id: trade.id,
          filename: file.filename
        });
      }
    }

    return res.status(200).json({ success: true, message: 'Trade updated successfully!' });

  } catch (error) {
    console.error('❌ Error updating trade:', error);
    return res.status(500).json({ success: false, message: 'Failed to update trade.' });
  }
};

exports.deleteScreenshot = async (req, res) => {
  try {
    const { id } = req.body; // screenshot record ID

    const screenshot = await TradeScreenshot.findByPk(id);
    if (!screenshot) {
      return res.status(404).json({ success: false, message: 'Screenshot not found' });
    }

    // Delete image from disk
    const filepath = path.join(__dirname, '../uploads/', screenshot.filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    // Delete from DB
    await screenshot.destroy();

    return res.json({ success: true, message: 'Screenshot deleted' });
  } catch (err) {
    console.error('❌ Error deleting screenshot:', err);
    return res.status(500).json({ success: false, message: 'Error deleting screenshot' });
  }
};
// ✅ Delete Trade
// DELETE /trades/delete/:id
exports.deleteTrade = async (req, res) => {
  try {
    const id = req.params.id;
    const trade = await Trade.findByPk(id);
    if (!trade) {
      return res.status(404).json({ success: false, message: 'Trade not found.' });
    }

    await trade.destroy();
    return res.status(200).json({ success: true, message: 'Trade deleted successfully!' });
  } catch (err) {
    console.error('❌ Error deleting trade:', err);
    return res.status(500).json({ success: false, message: 'Server error while deleting trade.' });
  }
};


// ✅ Get Brokers by Market Type (for AJAX)
exports.getBrokersByMarket = async (req, res) => {
  try {
    const marketType = req.query.market_type;
    const brokers = await Broker.findAll({
      where: { market_id: marketType },
      attributes: ['id', 'name']
    });
    res.json(brokers);
  } catch (err) {
    console.error('Error fetching brokers:', err);
    res.status(500).json({ error: 'Failed to load brokers' });
  }
};

exports.renderReportDashboard = async (req, res) => {
  const market = req.query.market || 1;
  const month = parseInt(req.query.month || moment().month());
  const year = parseInt(req.query.year || moment().year());

  try {
    const user_id = req.session.user.id;
    const startDate = moment({ year, month }).startOf('month').format('YYYY-MM-DD');
    const endDate = moment({ year, month }).endOf('month').format('YYYY-MM-DD');

    const trades = await Trade.findAll({
      where: {
        user_id,
        market_type: market,
        datetime: {
          [Op.between]: [startDate, endDate]
        }
      }
    });

    const weekdayStats = {};
    const totalDays = new Set();

    let capitalUsage = [], dailyTradeCount = {}, winCount = {}, rrByDay = {};
    let totalCapital = 0, totalQuantity = 0;
    let maxCapital = 0, minCapital = Infinity, maxQty = 0, minQty = Infinity;

    let overtradeDays = 0, oneTradeDays = 0;

    let win = 0, loss = 0, breakeven = 0;
    let winSum = 0, lossSum = 0;
    let symbolFreq = {}, strategyStats = {};
    let dailyPnl = {};

    let consecutiveWins = 0, consecutiveLosses = 0, maxConsecWins = 0, maxConsecLosses = 0;
    let prevWin = null;

    for (const t of trades) {
      const capital = parseFloat(t.entry_amount || 0);
      const qty = parseFloat(t.entry_quantity || 0);
      const pnl = parseFloat(t.pnl_amount || 0);
      const rr = (t.stop_loss && t.target)
        ? Math.abs(t.target - t.entry_price) / Math.abs(t.entry_price - t.stop_loss || 1)
        : 0;

      const date = t.datetime.split(' ')[0];
      const weekday = moment(date).format('dddd');

      capitalUsage.push(capital);
      totalCapital += capital;
      totalQuantity += qty;
      maxCapital = Math.max(maxCapital, capital);
      minCapital = Math.min(minCapital, capital || minCapital);
      maxQty = Math.max(maxQty, qty);
      minQty = Math.min(minQty, qty || minQty);

      dailyTradeCount[date] = (dailyTradeCount[date] || 0) + 1;
      dailyPnl[date] = (dailyPnl[date] || 0) + pnl;

      if (!weekdayStats[weekday]) weekdayStats[weekday] = { wins: 0, total: 0, rr: 0, rrCount: 0 };
      weekdayStats[weekday].total += 1;
      weekdayStats[weekday].rr += rr;
      weekdayStats[weekday].rrCount += rr > 0 ? 1 : 0;

      totalDays.add(date);

      // Trade outcomes
      if (pnl > 0) {
        win++;
        winSum += pnl;
        if (prevWin === true) consecutiveWins++; else consecutiveWins = 1;
        maxConsecWins = Math.max(maxConsecWins, consecutiveWins);
        prevWin = true;

        // ✅ FIX: Count weekday wins
        weekdayStats[weekday].wins += 1;

      } else if (pnl < 0) {
        loss++;
        lossSum += pnl;
        if (prevWin === false) consecutiveLosses++; else consecutiveLosses = 1;
        maxConsecLosses = Math.max(maxConsecLosses, consecutiveLosses);
        prevWin = false;
      } else {
        breakeven++;
        prevWin = null;
      }

      symbolFreq[t.symbol] = (symbolFreq[t.symbol] || 0) + 1;
      strategyStats[t.strategy_id] = strategyStats[t.strategy_id] || { total: 0, wins: 0 };
      strategyStats[t.strategy_id].total++;
      if (pnl > 0) strategyStats[t.strategy_id].wins++;
    }

    const winDays = Object.values(dailyPnl).filter(p => p > 0).length;
    const lossDays = Object.values(dailyPnl).filter(p => p < 0).length;
    const beDays = Object.values(dailyPnl).filter(p => p === 0).length;
    const bestDay = Object.values(dailyPnl).length ? Math.max(...Object.values(dailyPnl)) : 0;
    const worstDay = Object.values(dailyPnl).length ? Math.min(...Object.values(dailyPnl)) : 0;
    
    const avgWinDay = winDays > 0 ? (winSum / winDays).toFixed(2) : 0;
    const avgLossDay = lossDays > 0 ? (lossSum / lossDays).toFixed(2) : 0;

    const totalTrades = trades.length;
    const avgCapital = totalTrades > 0 ? totalCapital / totalTrades : 0;
    const avgQty = totalTrades > 0 ? totalQuantity / totalTrades : 0;
    const maxCapPnl = trades.find(t => parseFloat(t.entry_amount || 0) === maxCapital)?.pnl_amount || 0;
    const minCapPnl = trades.find(t => parseFloat(t.entry_amount || 0) === minCapital)?.pnl_amount || 0;
    const maxQtyPnl = trades.find(t => parseFloat(t.entry_quantity || 0) === maxQty)?.pnl_amount || 0;
    const minQtyPnl = trades.find(t => parseFloat(t.entry_quantity || 0) === minQty)?.pnl_amount || 0;

    const expectancy = totalTrades > 0
      ? ((win / totalTrades) * (winSum / win || 0) + (loss / totalTrades) * (lossSum / loss || 0)).toFixed(2)
      : 0;

    const strategies = await Strategy.findAll({ attributes: ['id', 'name'] });
    const strategyMap = Object.fromEntries(strategies.map(s => [s.id, s.name]));
    let mostProfitableStrategy = '-';
    let maxStrategyWinRate = 0;

    for (const [sid, s] of Object.entries(strategyStats)) {
      const winRate = s.total ? (s.wins / s.total) * 100 : 0;
      if (winRate > maxStrategyWinRate) {
        maxStrategyWinRate = winRate;
        mostProfitableStrategy = strategyMap[sid] || '-';
      }
    }

    const avgTradesPerDay = totalDays.size > 0 ? totalTrades / totalDays.size : 0;
    const maxTradesInADay = Math.max(...Object.values(dailyTradeCount), 0);
    const marketList = await MarketCategory.findAll();
// Post-processing: Count overtrade and 1-trade days
    Object.entries(dailyTradeCount).forEach(([day, count]) => {
      if (count === 1) oneTradeDays++;
      if (count > 7) overtradeDays++;
    });
    Object.entries(weekdayStats).forEach(([day, stat]) => {
      stat.avgRR = stat.rrCount > 0 ? (stat.rr / stat.rrCount).toFixed(2) : '0.00';
    });
      const currencySymbol = (market == 1) ? '₹' : '$';

    res.render('reports/index', {
      activePage: 'reports',
      currencySymbol,
      marketList,
      market,
      month,
      year,
      capital: {
        max: maxCapital,
        min: minCapital,
        avg: avgCapital,
        pnlMax: maxCapPnl,
        pnlMin: minCapPnl
      },
      quantity: {
        max: maxQty,
        min: minQty,
        avg: avgQty,
        pnlMax: maxQtyPnl,
        pnlMin: minQtyPnl
      },
      dailyActivity: {
        avgTradesPerDay,
        maxTradesInADay,
        oneTradeDays,
        overtradeDays
      },
      tradePerformance: {
        win, loss, breakeven,
        avgWin: win > 0 ? winSum / win : 0,
        avgLoss: loss > 0 ? lossSum / loss : 0,
        winRate: totalTrades > 0 ? (win / totalTrades) * 100 : 0,
        expectancy
      },
      dailyPerformance: {
        winDays, lossDays, beDays,
        bestDay, worstDay, avgWinDay, avgLossDay
      },
      tradeExecution: {
        totalTrades,
        avgCapital,
        mostProfitableStrategy,
        consecutiveWins: maxConsecWins,
        consecutiveLosses: maxConsecLosses
      },
      timeMetrics: {
        tradingDays: totalDays.size,
        consecutiveWinDays: 0,
        consecutiveLossDays: 0
      },
      strategyStats: Object.entries(strategyStats).map(([sid, stat]) => ({
        name: strategyMap[sid] || 'Unknown',
        winRate: stat.total ? (stat.wins / stat.total * 100).toFixed(1) : '0'
      })),
      symbolFrequency: Object.entries(symbolFreq)
        .map(([symbol, count]) => ({ symbol, count }))
        .sort((a, b) => b.count - a.count),
      weekdayStats
    });

  } catch (err) {
    console.error('❌ Report Error:', err);
    res.status(500).send('Error loading reports');
  }
};

exports.renderTradesByDay = async (req, res) => {
  try {
    const user_id = req.session.user.id;
    const date = req.query.date;

    if (!date || !moment(date, 'YYYY-MM-DD', true).isValid()) {
      return res.status(400).send('Invalid or missing date.');
    }

    const trades = await Trade.findAll({
      where: {
        user_id,
        datetime: {
          [Op.gte]: moment(date).startOf('day').toDate(),
          [Op.lte]: moment(date).endOf('day').toDate()
        }
      },
      order: [['datetime', 'ASC']]
    });

    res.render('trades/day', {
      activePage: 'trades',
      trades,
      date
    });
  } catch (err) {
    console.error('Error loading trades for day:', err);
    res.status(500).send('Failed to load trades.');
  }
};

exports.renderDashboard = async (req, res) => {
  try {
    const user_id = req.session.user.id;
    const market = parseInt(req.query.market) || 1;
    const month = req.query.month !== undefined ? parseInt(req.query.month) : moment().month();
    const year = parseInt(req.query.year) || moment().year();

    const startOfMonth = moment({ year, month, day: 1 }).startOf('month').toDate();
    const endOfMonth = moment({ year, month, day: 1 }).endOf('month').toDate();
    const lastMonthStart = moment(startOfMonth).subtract(1, 'month').startOf('month').toDate();
    const lastMonthEnd = moment(startOfMonth).subtract(1, 'month').endOf('month').toDate();

    const currency = (market == 1) ? '₹' : '$';

    const [currentTrades, previousTrades] = await Promise.all([
      Trade.findAll({
        where: { user_id, market_type: market, datetime: { [Op.between]: [startOfMonth, endOfMonth] } },
        include: [{ model: Strategy, as: 'Strategy' }]
      }),
      Trade.findAll({
        where: { user_id, market_type: market, datetime: { [Op.between]: [lastMonthStart, lastMonthEnd] } }
      })
    ]);

    // --- Quantity normalization ---
    function getRealQty(t) {
      const qty = parseFloat(t.entry_quantity || 0);
      if (t.market_type === 2) { // Crypto
        const sym = (t.symbol || '').toUpperCase();
        if (sym.includes('BTC')) return qty / 1000;
        if (sym.includes('ETH')) return qty / 100;
        return qty;
      }
      return qty; // Indian market
    }

    // --- Helper to compute P&L dynamically ---
    const getPnL = (t) => {
      const entry = parseFloat(t.entry_price || 0);
      const exit = parseFloat(t.exit_price || 0);
      const realQty = getRealQty(t);
      if (!entry || !exit || !realQty) return 0;
      return t.trade_type === 2
        ? (entry - exit) * realQty // short
        : (exit - entry) * realQty; // long
    };

    // --- Stats calculator ---
    const calcStats = (trades) => {
      let win = 0, loss = 0, rrSum = 0, rrCount = 0, highestPnl = 0, lowestPnl = 0;
      let grossPnl = 0, totalBrokerage = 0, totalHoldTime = 0, rulesFollowed = 0;
      const symbolFreq = {};

      for (const t of trades) {
        const pnl = getPnL(t);
        grossPnl += pnl;
        totalBrokerage += parseFloat(t.brokerage || 0);
        highestPnl = Math.max(highestPnl, pnl);
        lowestPnl = Math.min(lowestPnl, pnl);

        if (pnl > 0) win++; else if (pnl < 0) loss++;

        const entry = parseFloat(t.entry_price || 0);
        const sl = parseFloat(t.stop_loss || 0);
        const tgt = parseFloat(t.target || 0);
        if (sl && tgt && entry && sl !== entry) {
          const rr = Math.abs(tgt - entry) / Math.abs(entry - sl);
          rrSum += rr; rrCount++;
        }

        const start = moment(t.created_at);
        const end = moment(t.updated_at);
        if (start.isValid() && end.isValid()) {
          totalHoldTime += end.diff(start, 'hours', true);
        }

        const symbol = t.symbol?.toUpperCase();
        if (symbol) symbolFreq[symbol] = (symbolFreq[symbol] || 0) + 1;

        if (typeof t.rules_followed === 'string' && t.rules_followed.trim() !== '') {
          rulesFollowed++;
        }
      }

      const total = trades.length;
      const topSymbol = Object.entries(symbolFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

      return {
        highestPnl: highestPnl.toFixed(2),
        lowestPnl: lowestPnl.toFixed(2),
        grossPnl: grossPnl.toFixed(2),
        totalBrokerage: totalBrokerage.toFixed(2),
        totalPnl: (grossPnl - totalBrokerage).toFixed(2), // 👈 alias for EJS
        netPnl: (grossPnl - totalBrokerage).toFixed(2),
        winRate: total ? ((win / total) * 100).toFixed(2) : '0.00',
        winLossRatio: loss ? (win / loss).toFixed(2) : win ? '∞' : '0',
        avgRR: rrCount ? (rrSum / rrCount).toFixed(2) : '0.00',
        avgHoldTime: total ? (totalHoldTime / total).toFixed(2) : '0.00',
        tradeCount: total,
        rulesFollowed: total ? ((rulesFollowed / total) * 100).toFixed(0) : 0,
        topSymbol
      };
    };

    const current = calcStats(currentTrades);
    const previous = calcStats(previousTrades);

    // --- Strategy vs P&L ---
    const strategyMap = {};
    currentTrades.forEach(t => {
      if (t.strategy_id && t.Strategy) {
        const name = t.Strategy.name;
        if (!strategyMap[name]) strategyMap[name] = { pnl: 0, count: 0 };
        strategyMap[name].pnl += getPnL(t);
        strategyMap[name].count++;
      }
    });
    const strategyPnL = Object.entries(strategyMap).map(([name, val]) => ({
      name,
      pnl: val.pnl.toFixed(2),
      count: val.count,
      winRate: ((currentTrades.filter(t => t.Strategy?.name === name && getPnL(t) > 0).length / val.count) * 100).toFixed(0)
    }));

    // --- Common Mistakes ---
    const allMistakes = await Mistake.findAll();
    const mistakeIdMap = {};
    allMistakes.forEach(m => { mistakeIdMap[m.id] = m.name; });

    const mistakeCounter = {};
    currentTrades.forEach(t => {
      if (t.mistakes) {
        const ids = t.mistakes.split(',').map(id => parseInt(id.trim()));
        ids.forEach(id => {
          const name = mistakeIdMap[id];
          if (name) mistakeCounter[name] = (mistakeCounter[name] || 0) + 1;
        });
      }
    });
    const commonMistakes = Object.entries(mistakeCounter)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // --- Daily P&L ---
    const dailyPnlMap = {};
    currentTrades.forEach(t => {
      const day = moment(t.datetime).format('YYYY-MM-DD');
      if (!dailyPnlMap[day]) dailyPnlMap[day] = { pnl: 0, brokerage: 0 };
      dailyPnlMap[day].pnl += getPnL(t);
      dailyPnlMap[day].brokerage += parseFloat(t.brokerage || 0);
    });
    const dailyPnlData = Object.entries(dailyPnlMap).map(([date, obj]) => ({
      date,
      grossPnl: parseFloat(obj.pnl.toFixed(2)),
      brokerage: parseFloat(obj.brokerage.toFixed(2)),
      netPnl: parseFloat((obj.pnl - obj.brokerage).toFixed(2))
    }));

    // --- Monthly P&L Trend (gross only, adjust if brokerage needed aggregated) ---
    const monthlyPnlRaw = await Trade.findAll({
      where: {
        user_id,
        market_type: market,
        datetime: {
          [Op.between]: [moment().startOf('year').toDate(), moment().endOf('year').toDate()]
        }
      },
      attributes: [
        [fn('MONTH', col('datetime')), 'month'],
        [fn('SUM', col('pnl_amount')), 'totalPnl']
      ],
      group: [fn('MONTH', col('datetime'))],
      order: [[fn('MONTH', col('datetime')), 'ASC']]
    });
    const monthlyPnlData = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const match = monthlyPnlRaw.find(item => parseInt(item.dataValues.month) === month);
      return {
        month: moment().month(i).format('MMM'),
        pnl: match ? parseFloat(match.dataValues.totalPnl) : 0
      };
    });

    // --- Win/Loss Pie ---
    const [wins, losses] = await Promise.all([
      Trade.count({ where: { user_id, market_type: market, pnl_amount: { [Op.gt]: 0 } } }),
      Trade.count({ where: { user_id, market_type: market, pnl_amount: { [Op.lt]: 0 } } })
    ]);

    // --- Active Signals ---
    const activeSignals = await TvTradeSignal.findAll({ limit: 6, order: [['added_on', 'DESC']] });

    // --- Today & Yesterday ---
    const todayDate = moment().format('YYYY-MM-DD');
    const currentToday = currentTrades.filter(t => moment(t.datetime).format('YYYY-MM-DD') === todayDate);
    const todayGross = currentToday.reduce((sum, t) => sum + getPnL(t), 0);
    const todayBrokerage = currentToday.reduce((sum, t) => sum + parseFloat(t.brokerage || 0), 0);

    const yesterdayDate = moment().subtract(1, 'day').format('YYYY-MM-DD');
    const currentYesterday = currentTrades.filter(t => moment(t.datetime).format('YYYY-MM-DD') === yesterdayDate);
    const yesterdayGross = currentYesterday.reduce((sum, t) => sum + getPnL(t), 0);
    const yesterdayBrokerage = currentYesterday.reduce((sum, t) => sum + parseFloat(t.brokerage || 0), 0);

    current.todayPnl = (todayGross - todayBrokerage);
    current.yesterdayPnl = (yesterdayGross - yesterdayBrokerage);

    const marketList = await MarketCategory.findAll({ attributes: ['id', 'market_name'] });

    res.render('dashboard', {
      activePage: 'dashboard',
      moment,
      current,
      previous,
      strategies: strategyPnL,
      marketList,
      market,
      month,
      year,
      currency,
      monthlyPnlData,
      winLossData: { win: wins, loss: losses },
      commonMistakes,
      dailyPnlData,
      activeSignals,
      ruleCompliance: current.rulesFollowed,
      confidenceIndex: current.winRate >= 70 ? 'High' : current.winRate >= 40 ? 'Medium' : 'Low'
    });
  } catch (err) {
    console.error('Dashboard Error:', err);
    res.status(500).send('Dashboard load failed');
  }
};

exports.renderSignals = async (req, res) => {
  try {
    const signals = await TvTradeSignal.findAll({ order: [['id', 'DESC']] });
    res.render('trades/signals', { signals, moment, activePage: 'signals' });
  } catch (err) {
    console.error('Signal Fetch Error:', err);
    res.status(500).send('Unable to load signals');
  }
};