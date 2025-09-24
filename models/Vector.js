module.exports = (sequelize, DataTypes) =>
  sequelize.define('Vector', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    type: DataTypes.ENUM('faq','kb'),
    ref_id: DataTypes.INTEGER,
    embedding: DataTypes.TEXT, // JSON string of array
    updated_at: DataTypes.DATE
  }, { tableName: 'tbl_vectors', timestamps: false });
