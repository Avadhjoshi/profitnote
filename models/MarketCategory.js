module.exports = (sequelize, DataTypes) => {
  return sequelize.define('MarketCategory', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    market_name: DataTypes.STRING
  }, {
    tableName: 'tbl_market_categories',
    timestamps: false
  });
};
