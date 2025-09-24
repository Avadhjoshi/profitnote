module.exports = (sequelize, DataTypes) =>
  sequelize.define('Knowledge', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: DataTypes.STRING,
    body: DataTypes.TEXT,
    tags: DataTypes.STRING,
    language_code: DataTypes.STRING,
    updated_at: DataTypes.DATE
  }, { tableName: 'tbl_kb', timestamps: false });
