module.exports = (sequelize, DataTypes) => {
  const Strategy = sequelize.define('Strategy', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
     market_type: {
      type: DataTypes.INTEGER,
    }
  }, {
    tableName: 'tbl_strategies',
    timestamps: false
  });

  // Associations
  Strategy.associate = (models) => {
    Strategy.hasMany(models.Trade, {
      foreignKey: 'strategy_id',
      as: 'trades' // Optional alias
    });

  };

  return Strategy;
};
