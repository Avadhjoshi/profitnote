// models/Alert.js
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Alert', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },

    // what to watch
    symbol: { type: DataTypes.STRING(64), allowNull: false },       // e.g. RELIANCE.NS, BTC-USD, USDINR=X
    timeframe: { type: DataTypes.STRING(12), allowNull: false, defaultValue: '1d' }, // 1m/5m/15m/30m/60m/1d/1wk/1mo

    // condition
    condition: {                                                     // above | below | crosses_above | crosses_below | cross
      type: DataTypes.ENUM('above','below','crosses_above','crosses_below','cross'),
      allowNull: false
    },

    // left side is always "price" (close) for v1
    left_type: { type: DataTypes.ENUM('price'), allowNull: false, defaultValue: 'price' },

    // right side can be a number or an indicator
    right_type: { type: DataTypes.ENUM('value','indicator'), allowNull: false },
    // when right_type === 'value'
    right_value: { type: DataTypes.DECIMAL(18,6), allowNull: true },

    // when right_type === 'indicator'
    right_indicator: { type: DataTypes.ENUM('EMA','SMA','RSI','MACD','ATR','SUPERTREND'), allowNull: true },
    right_period: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }, // e.g. 20 for EMA20

    // misc
    note: { type: DataTypes.TEXT, allowNull: true },                 // raw user phrase
    status: { type: DataTypes.ENUM('active','triggered','cancelled'), allowNull: false, defaultValue: 'active' },

    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    triggered_at: { type: DataTypes.DATE, allowNull: true }
  }, {
    tableName: 'tbl_alerts',
    timestamps: false
  });
};
