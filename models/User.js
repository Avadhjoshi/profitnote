module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    user_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    full_name: DataTypes.STRING(255),
    email: { type: DataTypes.STRING(255), unique: true },
    phone: DataTypes.STRING(30),
    password: DataTypes.STRING(255),
    role: {
      type: DataTypes.ENUM('TRADER', 'ADMIN', 'VIEWER'),
      defaultValue: 'TRADER'
    },
    referral_code: DataTypes.STRING(30),
    referred_by: DataTypes.STRING(30),
    valid_till: DataTypes.DATEONLY,
    status: {
      type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'BANNED'),
      defaultValue: 'ACTIVE'
    },
    created_at: DataTypes.STRING(30),
    updated_at: DataTypes.STRING(30),
    last_login_time: DataTypes.STRING(30),
    google_id: DataTypes.STRING(255)
  }, {
    tableName: 'tbl_users',
    timestamps: false
  });

 
  return User;
};
