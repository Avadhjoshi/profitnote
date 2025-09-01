const { Strategy, Trade, User,MarketCategory } = require('../models');
const { Op } = require('sequelize');

// ✅ List Strategies (with pagination and enriched stats)
exports.listStrategies = async (req, res) => {
  try {
      const market = parseInt(req.query.market) || 1;
 // 🔥 Fetch all strategies with associated trades (no pagination)
    const strategies = await Strategy.findAll({
   where: { market_type: market }, // filter strategies by selected market
       
      include: [{ model: Trade, as: 'trades' }],
      order: [['id', 'DESC']]
    });

    const enriched = strategies.map(strategy => {
      const trades = strategy.trades || [];
      const totalTrades = trades.length;

      const wins = trades.filter(t => parseFloat(t.pnl_amount || 0) > 0).length;
      const totalPnl = trades.reduce((sum, t) => sum + parseFloat(t.pnl_amount || 0), 0);

      const totalWinPnl = trades
        .filter(t => parseFloat(t.pnl_amount || 0) > 0)
        .reduce((sum, t) => sum + parseFloat(t.pnl_amount), 0);

      const totalLossPnl = trades
        .filter(t => parseFloat(t.pnl_amount || 0) < 0)
        .reduce((sum, t) => sum + Math.abs(parseFloat(t.pnl_amount)), 0);

      const profitFactor =
        totalLossPnl === 0
          ? totalWinPnl > 0
            ? '∞'
            : '0.00'
          : (totalWinPnl / totalLossPnl).toFixed(2);

      const avgRiskTrade =
        trades.length > 0
          ? (
              trades.reduce((sum, t) => {
                const entry = parseFloat(t.entry_price || 0);
                const stop = parseFloat(t.stop_loss || 0);
                return sum + (entry > 0 ? (stop / entry) * 100 : 0);
              }, 0) / trades.length
            ).toFixed(2) + '%'
          : '0.00%';

      const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(2) : '0.00';

      const avgRR =
        trades.length > 0
          ? (
              trades.reduce((sum, t) => sum + parseFloat(t.rr || 0), 0) / trades.length
            ).toFixed(2)
          : '0.00';

      return {
        ...strategy.dataValues,
        usage: totalTrades > 0 ? ((totalTrades / 3) * 100).toFixed(1) : '0.0',
        profit_factor: profitFactor,
        risk_trade: avgRiskTrade,
        total_profit: totalPnl.toFixed(2),
        win_rate: winRate,
        rr: avgRR,
        trades_count: totalTrades
      };
    });
        const marketList = await MarketCategory.findAll({ attributes: ['id', 'market_name'] });

const currencySymbol = market === 1 ? '₹' : '$'; // 3 = crypto

    res.render('strategies/list', {
      strategies: enriched,
      activePage: 'strategies',
      currencySymbol,
            selectedMarketId: market, // ✅ pass to EJS

      marketList
    });
  } catch (err) {
    console.error('Error loading strategies:', err);
    res.status(500).send('Internal Server Error');
  }
};

// ✅ Render Add Strategy Form
exports.renderAddStrategy = async (req, res) => {
  try {
    res.render('strategies/add', {
      activePage: 'strategies'
    });
  } catch (err) {
    console.error('Error rendering add form:', err);
    res.status(500).send('Internal Server Error');
  }
};

// ✅ Save Strategy (AJAX version)
exports.saveStrategy = async (req, res) => {
  try {
    await Strategy.create({
      name: req.body.name,
      description: req.body.description,
      user_id: req.session.user.id,
      market_type: req.body.market_type,
      created_at: new Date().toISOString()
    });
    return res.status(200).json({ success: true, message: 'Strategy added successfully!' });
  } catch (err) {
    console.error('❌ Error saving strategy:', err);
    return res.status(500).json({ success: false, message: 'Failed to save strategy' });
  }
};

// ✅ Update Strategy
exports.updateStrategy = async (req, res) => {
  try {
    await Strategy.update(
      {
        name: req.body.name,
        description: req.body.description,
        market_type: req.body.market_type,
        updated_at: new Date().toISOString()
      },
      { where: { id: req.params.id } }
    );
    return res.status(200).json({ success: true, message: 'Strategy updated successfully!' });
  } catch (err) {
    console.error('❌ Error updating strategy:', err);
    return res.status(500).json({ success: false, message: 'Failed to update strategy' });
  }
};

// ✅ Delete Strategy
exports.deleteStrategy = async (req, res) => {
  try {
    await Strategy.destroy({ where: { id: req.params.id } });
    return res.status(200).json({ success: true, message: 'Strategy deleted successfully!' });
  } catch (err) {
    console.error('❌ Error deleting strategy:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete strategy' });
  }
};

// ✅ Render Edit Strategy Form
exports.renderEditStrategy = async (req, res) => {
  try {
    const strategy = await Strategy.findByPk(req.params.id);
    if (!strategy) return res.status(404).send('Strategy not found');

    res.render('strategies/edit', {
      strategy,
      activePage: 'strategies'
    });
  } catch (err) {
    console.error('Error rendering edit form:', err);
    res.status(500).send('Internal Server Error');
  }
};

exports.getStrategyJson = async (req, res) => {
  try {
    const strategy = await Strategy.findByPk(req.params.id);
    if (!strategy) return res.json({ success: false, message: 'Strategy not found' });

    res.json({ success: true, strategy });
  } catch (err) {
    console.error('Error fetching strategy:', err);
    res.json({ success: false, message: 'Internal server error' });
  }
};
