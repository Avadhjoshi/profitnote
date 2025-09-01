module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Mistake', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.TINYINT, defaultValue: 1 },
    created_at: { type: DataTypes.STRING },
    updated_at: { type: DataTypes.STRING }
  }, {
    tableName: 'tbl_mistakes',
    timestamps: false
  });
};
