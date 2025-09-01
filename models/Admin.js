module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Admin', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    email: DataTypes.STRING,
    password: DataTypes.STRING,
  }, {
    tableName: 'tbl_admins'
  });
};
