// models/Conversation.js
const { randomUUID } = require('crypto');

module.exports = (sequelize, DataTypes) => {
  const Conversation = sequelize.define('Conversation', {
    id:        { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    public_id: { type: DataTypes.STRING, defaultValue: () => randomUUID(), unique: true }, 
    user_id:   { type: DataTypes.INTEGER, allowNull: false },
    title:     { type: DataTypes.STRING,  allowNull: false },
    last_symbol:     { type: DataTypes.STRING,  allowNull: false },
    created_at:{ type: DataTypes.DATE,    defaultValue: DataTypes.NOW }
  }, {
    tableName: 'tbl_conversations',
    timestamps: false
  });

  Conversation.associate = (models) => {
    Conversation.hasMany(models.Message, {
      foreignKey: 'conversation_id',
      as: 'messages'      // 👈 remember this alias
    });
  };

  return Conversation;
};
