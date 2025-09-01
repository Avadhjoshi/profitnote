module.exports = (sequelize, DataTypes) => {
  return sequelize.define("AIReport", {
    user_id: DataTypes.INTEGER,
    report_type: DataTypes.STRING,
    report_content: DataTypes.TEXT,
    image:DataTypes.STRING,
    created_at: DataTypes.DATE,
  }, {
    tableName: "tbl_ai_reports",
    timestamps: false,
  });
};
