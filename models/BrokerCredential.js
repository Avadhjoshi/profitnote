module.exports = (sequelize, DataTypes) => {
  return sequelize.define('BrokerCredential', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    broker_id: { type: DataTypes.INTEGER, allowNull: false },
    api_key: DataTypes.STRING(255),
    secret_key: DataTypes.STRING(255),
    client_id: DataTypes.STRING(255),
    client_secret: DataTypes.STRING(255),
    client_code: DataTypes.STRING(255),
    pin: DataTypes.STRING(255),
    totp_secret:DataTypes.INTEGER,
    access_token: DataTypes.STRING(255),
    refresh_token: DataTypes.STRING(255),
    created_at: DataTypes.STRING(30),
    updated_at: DataTypes.STRING(30)
  }, {
    tableName: 'tbl_broker_credentials',
    timestamps: false
  });
};
