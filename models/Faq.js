module.exports = (sequelize, DataTypes) =>
  sequelize.define('Faq', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    question: DataTypes.TEXT,
    answer: DataTypes.TEXT,
    language_code: DataTypes.STRING,
    updated_at: DataTypes.DATE
  }, { tableName: 'tbl_faqs', timestamps: false });
