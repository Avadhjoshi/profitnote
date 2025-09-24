// models/Message.js
module.exports = (sequelize, DataTypes) => {
  const Message = sequelize.define('Message', {
    id:              { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    conversation_id: { type: DataTypes.INTEGER, allowNull: false },
    role:            { type: DataTypes.ENUM('user','assistant'), allowNull: false },
    content:         { type: DataTypes.TEXT('long'), allowNull: false },
    created_at:      { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'tbl_messages',
    timestamps: false
  });

  Message.associate = (models) => {
    Message.belongsTo(models.Conversation, {
      foreignKey: 'conversation_id',
      as: 'conversation'
    });
  };

  return Message;
};
