// controllers/calendarController.js
const moment = require('moment');
const { Trade, MarketCategory } = require('../models');
const { Op } = require('sequelize');

exports.renderCalendar = async (req, res) => {
  try {
    const userId = req.session.user.id;

    // Get selected filters
    const market = parseInt(req.query.market) || 2; // Default to Crypto
    const month = parseInt(req.query.month) || moment().month();
    const year = parseInt(req.query.year) || moment().year();

    // Market list for dropdown
    const marketList = await MarketCategory.findAll();

    // Fetch trades
    const trades = await Trade.findAll({
      where: {
        user_id: userId,
        market_type: market,
        datetime: {
          [Op.between]: [
            moment({ year, month, day: 1 }).startOf('month').toDate(),
            moment({ year, month, day: 1 }).endOf('month').toDate()
          ]
        }
      },
      attributes: [
        'id',
        'symbol',
        'pnl_amount',
        'entry_price',
        'exit_price',
        'stop_loss',
        'entry_quantity',
        'brokerage',
        'datetime',
        'trade_type',   // 1=Long, 2=Short
        'market_type'   // to distinguish Crypto vs Indian
      ],
      order: [['datetime', 'ASC']]
    });

    // --- Contract multipliers ---
    function getRealQty(t) {
      const qtyContracts = parseFloat(t.entry_quantity || 0);

      // Crypto (market_type = 2)
      if (t.market_type === 2) {
        const s = (t.symbol || '').toUpperCase();
        if (s.includes('BTC')) return qtyContracts / 1000; // 1000 contracts = 1 BTC
        if (s.includes('ETH')) return qtyContracts / 100;  // 100 contracts = 1 ETH
        return qtyContracts; // fallback
      }

      // Indian market (market_type = 1): 1 quantity = 1 lot
      return qtyContracts;
    }

    // --- PnL calculation ---
    function calcPnL(t) {
      const entry = parseFloat(t.entry_price || 0);
      const exit = parseFloat(t.exit_price || 0);
      const realQty = getRealQty(t);

      if (!entry || !exit || !realQty) return parseFloat(t.pnl_amount || 0);

      if (t.trade_type === 1) {
        // Long
        return (exit - entry) * realQty;
      } else if (t.trade_type === 2) {
        // Short
        return (entry - exit) * realQty;
      }
      return parseFloat(t.pnl_amount || 0);
    }

    // Group trades by date
    const tradesByDate = {};
    trades.forEach(trade => {
      const dateKey = moment(trade.datetime).format('YYYY-MM-DD');
      if (!tradesByDate[dateKey]) tradesByDate[dateKey] = [];
      tradesByDate[dateKey].push(trade);
    });

    // Calendar cells
    const daysInMonth = moment({ year, month }).daysInMonth();
    const startDay = moment({ year, month, day: 1 }).day();
    const totalCells = startDay + daysInMonth;
    const calendarCells = [];

    for (let i = 0; i < totalCells; i++) {
      if (i < startDay) {
        calendarCells.push({ empty: true });
      } else {
        const day = i - startDay + 1;
        const dateKey = moment({ year, month, day }).format('YYYY-MM-DD');
        const tradeList = tradesByDate[dateKey] || [];

        let dailyPnl = 0;
        let dailyBrokerage = 0;

        tradeList.forEach(t => {
          dailyPnl += calcPnL(t);
          dailyBrokerage += parseFloat(t.brokerage || 0);
        });

        calendarCells.push({
          empty: false,
          day,
          market,
          date: dateKey,
          tradeList,
          totalProfit: dailyPnl.toFixed(2),
          totalBrokerage: dailyBrokerage.toFixed(2),
            totalProfit: (dailyPnl - dailyBrokerage).toFixed(2)       // ✅ Net PnL after brokerage

        });
      }
    }

    // Stats
    const totalTrades = trades.length;
    let totalPnl = 0, totalBrokerage = 0, winningTrades = 0;

    trades.forEach(t => {
      const pnl = calcPnL(t);
      totalPnl += pnl;
      totalBrokerage += parseFloat(t.brokerage || 0);
      if (pnl > 0) winningTrades++;
    });

    const rrList = trades.map(t => {
      const entry = parseFloat(t.entry_price || 0);
      const exit = parseFloat(t.exit_price || 0);
      const sl = parseFloat(t.stop_loss || 0);
      const realQty = getRealQty(t);

      if (!entry || !sl || !exit || !realQty) return 0;

      let risk, reward;
      if (t.trade_type === 1) {
        risk = (entry - sl) * realQty;
        reward = (exit - entry) * realQty;
      } else if (t.trade_type === 2) {
        risk = (sl - entry) * realQty;
        reward = (entry - exit) * realQty;
      } else {
        return 0;
      }
      if (risk <= 0) return 0;
      return reward / risk;
    });

    const avgRR = rrList.length > 0
      ? (rrList.reduce((a, b) => a + b, 0) / rrList.length).toFixed(2)
      : 0;

    const stat = {
      totalPnl: totalPnl.toFixed(2),
      totalBrokerage: totalBrokerage.toFixed(2),
      netPnl: (totalPnl - totalBrokerage).toFixed(2),
      totalTrades,
      winRate: totalTrades > 0 ? Math.round((winningTrades / totalTrades) * 100) : 0,
      avgRR
    };

    res.render('calendar', {
      activePage: 'calendar',
      calendarCells,
      stat,
      marketList,
      market,
      month,
      year
    });
  } catch (error) {
    console.error('Error loading calendar:', error);
    res.status(500).send('Internal Server Error');
  }
};
