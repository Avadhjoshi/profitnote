// models/TvTradeSignal.js
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('TvTradeSignal', {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    symbol: DataTypes.STRING,
    tf: DataTypes.INTEGER,
    side: DataTypes.ENUM('buy', 'sell'),
    strategy_name: DataTypes.STRING,
    entry_price: DataTypes.DECIMAL(18, 8),
    sl: DataTypes.DECIMAL(18, 8),
    tp1: DataTypes.DECIMAL(18, 8),
    tp2: DataTypes.DECIMAL(18, 8),
    tp3: DataTypes.DECIMAL(18, 8),
    qty: DataTypes.DECIMAL(18, 8),
    entry_time: DataTypes.DATE,
    sl_time: DataTypes.DATE,
    tp1_time: DataTypes.DATE,
    tp2_time: DataTypes.DATE,
    tp3_time: DataTypes.DATE,
    raw_payload: DataTypes.TEXT,
    added_on: DataTypes.DATE,
    trade_id: DataTypes.STRING
  }, {
    tableName: 'tv_trade_signals',
    timestamps: false
  });
};
