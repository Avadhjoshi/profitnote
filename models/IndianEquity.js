// models/IndianEquity.js
module.exports = (sequelize, DataTypes) => {
  const IndianEquity = sequelize.define('IndianEquity', {
    symbol:        { type: DataTypes.STRING(20),  allowNull: false, primaryKey: true },
    company_name:  { type: DataTypes.STRING(255), allowNull: false },
    series:        { type: DataTypes.STRING(10)  },
    date_of_listing:{ type: DataTypes.DATEONLY   },
    paid_up_value: { type: DataTypes.DECIMAL(12,2) },
    market_lot:    { type: DataTypes.INTEGER     },
    isin_number:   { type: DataTypes.STRING(20)  },
    face_value:    { type: DataTypes.DECIMAL(12,2) },
  }, {
    tableName: 'tbl_equity_list',
    timestamps: false,
  });
  return IndianEquity;
};
