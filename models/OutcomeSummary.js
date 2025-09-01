module.exports = (sequelize, DataTypes) => {
  return sequelize.define('OutcomeSummary', {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    label: DataTypes.STRING,
  }, {
    tableName: 'tbl_outcome_summaries',
    timestamps: false,
  });
};
