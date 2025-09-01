module.exports = (sequelize, DataTypes) => {
  const Trade = sequelize.define('Trade', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    user_id: DataTypes.INTEGER,
    market_type: DataTypes.TINYINT,
    broker_id: DataTypes.INTEGER,
    symbol: DataTypes.STRING,
    datetime: DataTypes.DATEONLY,
    entry_price: DataTypes.DECIMAL(18, 4),
    entry_amount: DataTypes.DECIMAL(18, 4), // ✅ Added here
    entry_quantity: DataTypes.DECIMAL(18, 4),
    exit_price: DataTypes.DECIMAL(18, 4),
    trade_type: DataTypes.TINYINT,
    stop_loss: DataTypes.DECIMAL(18, 4),
    target: DataTypes.DECIMAL(18, 4), 
    strategy_id: DataTypes.INTEGER,
    outcome_summary_id: DataTypes.INTEGER,
    rationale: DataTypes.TEXT,
    rules_followed: DataTypes.TEXT,
    confidence_level: DataTypes.TINYINT,
    satisfaction_level: DataTypes.TINYINT,
    emotion_id: DataTypes.TINYINT,
    mistakes: DataTypes.TEXT,
    lesson: DataTypes.TEXT,
    created_at: DataTypes.STRING,
    updated_at: DataTypes.STRING,
    leverage: DataTypes.INTEGER,
    margin_used: DataTypes.FLOAT,
    pnl_amount: DataTypes.INTEGER,
    pnl_percent: DataTypes.FLOAT,
    order_id: DataTypes.STRING,
    brokerage: DataTypes.DECIMAL(18, 4)
  }, {
    tableName: 'tbl_trades',
    timestamps: false
  });

  // Define association
  Trade.associate = (models) => {
    Trade.belongsTo(models.Strategy, {
      foreignKey: 'strategy_id',
      as: 'Strategy'
    });
    
     Trade.belongsTo(models.OutcomeSummary, { foreignKey: 'outcome_summary_id', as: 'Outcome' });
  
  };

  return Trade;
};
