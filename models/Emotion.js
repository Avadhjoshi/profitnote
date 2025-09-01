module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Emotion', {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    label: DataTypes.STRING,
  }, {
    tableName: 'tbl_emotions',
    timestamps: false,
  });
};
