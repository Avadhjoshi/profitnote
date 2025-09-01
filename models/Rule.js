module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Rule', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: DataTypes.INTEGER,
    rule_name: DataTypes.STRING,
    category: DataTypes.STRING,
    description: DataTypes.TEXT,
    created_at: DataTypes.STRING,
    updated_at: DataTypes.STRING
  }, {
    tableName: 'tbl_rules',
    timestamps: false
  });
};
