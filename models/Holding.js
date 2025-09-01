module.exports = (sequelize, DataTypes) => {
  const Holding = sequelize.define("Holding", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    user_id: DataTypes.INTEGER,
    broker_id: DataTypes.INTEGER,
    market_type: DataTypes.INTEGER,
    tradingsymbol: DataTypes.STRING,
    exchange: DataTypes.STRING,
    instrument_token: DataTypes.BIGINT,
    isin: DataTypes.STRING,
    product: DataTypes.STRING,
    quantity: DataTypes.INTEGER,
    t1_quantity: DataTypes.INTEGER,
    collateral_quantity: DataTypes.INTEGER,
    average_price: DataTypes.DECIMAL(18, 2),
    last_price: DataTypes.DECIMAL(18, 2),
    pnl: DataTypes.DECIMAL(18, 2),
    market_value: DataTypes.DECIMAL(18, 2),
    day_change: DataTypes.DECIMAL(18, 2),
    created_at: DataTypes.STRING,
    updated_at: DataTypes.STRING,
  }, {
    tableName: 'tbl_holdings',
    timestamps: false,
  });

  // 👇 Association here
  Holding.associate = (models) => {
    Holding.belongsTo(models.Broker, {
      foreignKey: 'broker_id',
      as: 'Broker'
    });
  };

  return Holding;
};
