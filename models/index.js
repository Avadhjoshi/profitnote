const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// Initialize models using functional style
const Admin = require('./Admin')(sequelize, DataTypes);
const Strategy = require('./Strategy')(sequelize, DataTypes);
const Emotion = require('./Emotion')(sequelize, DataTypes);
const OutcomeSummary = require('./OutcomeSummary')(sequelize, DataTypes);
const Rule = require('./Rule')(sequelize, DataTypes);
const MarketCategory = require('./MarketCategory')(sequelize, DataTypes);
const Broker = require('./Broker')(sequelize, DataTypes);
const Trade = require('./Trade')(sequelize, DataTypes);
const Mistake = require('./Mistake')(sequelize, DataTypes);
const TradeScreenshot = require('./TradeScreenshot')(sequelize, DataTypes);
const User = require('./User')(sequelize, DataTypes);
const BrokerCredential = require('./BrokerCredential')(sequelize, DataTypes);
const TvTradeSignal = require('./TvTradeSignal')(sequelize, DataTypes);
const Holding = require('./Holding')(sequelize, DataTypes);
const AIReport = require('./AIReport')(sequelize, DataTypes);
const AIHoldingUsage = require('./AIHoldingUsage')(sequelize, DataTypes);
const Faq      = require('./Faq')(sequelize, DataTypes);
const Knowledge = require('./Knowledge')(sequelize, DataTypes);
const Vector   = require('./Vector')(sequelize, DataTypes);
const Conversation = require('./Conversation')(sequelize, DataTypes);
const Message   = require('./Message')(sequelize, DataTypes);
const Alert   = require('./Alert')(sequelize, DataTypes);
const IndianEquity   = require('./IndianEquity')(sequelize, DataTypes);

// Create central db object
const db = {
  sequelize,
  Sequelize,
  DataTypes,
  Admin,
  Strategy,
  Emotion,
  OutcomeSummary,
  Rule,
  MarketCategory,
  Broker,
  Trade,
  Mistake,
  TradeScreenshot,
  User,
  TvTradeSignal,
  BrokerCredential,
  Holding,
  AIReport,
  AIHoldingUsage,
  Faq,
  Knowledge,
  Vector,
  Conversation,
  Message,
  Alert,
  IndianEquity
};

// Setup associations if needed (optional)
Object.keys(db).forEach((modelName) => {
  if (db[modelName] && db[modelName].associate) {
    db[modelName].associate(db);
  }
});
if (!Conversation.associations.messages) {
  Conversation.hasMany(Message, { foreignKey: 'conversation_id', as: 'messages' });
}
if (!Message.associations.conversation) {
  Message.belongsTo(Conversation, { foreignKey: 'conversation_id', as: 'conversation' });
}

module.exports = db;
