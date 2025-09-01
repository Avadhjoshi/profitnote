module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Broker', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    market_id: DataTypes.TINYINT,
    name: DataTypes.STRING,
    icon_url: DataTypes.STRING,
    callback_url: DataTypes.STRING

  }, {
    tableName: 'tbl_broker',
    timestamps: false
  });
};
