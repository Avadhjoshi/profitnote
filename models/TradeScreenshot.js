module.exports = (sequelize, DataTypes) => {
  return sequelize.define('TradeScreenshot', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    trade_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    filename: {
      type: DataTypes.STRING,
      allowNull: false
    }
  }, {
    tableName: 'tbl_trade_screenshots',
    timestamps: false
  });
};
