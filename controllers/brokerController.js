// controllers/brokerController.js
const { Broker, BrokerCredential, MarketCategory,Holding } = require('../models');
const moment = require('moment');

// Render Broker UI with saved credentials
exports.showCredentialsForm = async (req, res) => {
  try {
    const user_id = req.session.user.id;

    const brokers = await Broker.findAll({ order: [['name', 'ASC']] });
    const marketCategories = await MarketCategory.findAll({ order: [['market_name', 'ASC']] });
    const saved = await BrokerCredential.findAll({ where: { user_id } });

    const credentialsMap = {};
    saved.forEach((c) => {
      credentialsMap[c.broker_id] = {
        api_key: c.api_key,
        secret_key: c.secret_key,
        client_id: c.client_id,
        pin: c.pin,
        totp_secret: c.totp_secret,
        
      };
    });

    res.render('broker/index', {
      brokers,
      marketCategories,
      credentialsMap,
      activePage: 'broker'
    });
  } catch (err) {
    console.error('Render error:', err);
    res.status(500).send('Internal Server Error');
  }
};
exports.saveCredentials = async (req, res) => {
  try {
    const user_id = req.session.user.id;
    const broker_id = req.body.broker_id;

    if (!broker_id) {
      console.log('❌ Missing broker_id in request:', req.body);
      return res.status(400).json({ success: false, message: 'Broker ID is missing' });
    }

    const data = {
      user_id,
      broker_id,
      api_key: req.body.api_key || '',
      secret_key: req.body.secret_key || '',
      client_id: req.body.client_id || '',
      pin: req.body.pin || '',
      totp_secret: req.body.totp_secret || '',
      updated_at: new Date().toISOString()
    };

    const existing = await BrokerCredential.findOne({ where: { user_id, broker_id } });

    if (existing) {
      await BrokerCredential.update(data, { where: { id: existing.id } });
    } else {
      data.created_at = new Date().toISOString();
      await BrokerCredential.create(data);
    }

    res.json({ success: true, broker_id, message: 'Credentials saved successfully.' });

  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ success: false, message: 'Failed to save credentials.' });
  }
};

// Delete broker credentials
exports.deleteCredentials = async (req, res) => {
  try {
    const { broker_id } = req.body;
    const user_id = req.session.user.id;

    await BrokerCredential.destroy({ where: { user_id, broker_id } });
    res.json({ success: true, message: 'Disconnected successfully', broker_id });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete credentials' });
  }
};


exports.viewHoldings = async (req, res) => {
  const user_id = req.session.user.id;
  const brokerFilter = req.query.broker || "";
  const marketTypeFilter = req.query.market_type || "1";

  try {
    const brokerList = await Broker.findAll();
    const marketCategories = await MarketCategory.findAll();

    const whereClause = { user_id };
    if (brokerFilter) whereClause.broker_id = brokerFilter;
    if (marketTypeFilter) whereClause.market_type = marketTypeFilter;

    const holdings = await Holding.findAll({
      where: whereClause,
      include: [
        { model: Broker, as: 'Broker', attributes: ['name'] }
      ],
      order: [['tradingsymbol', 'ASC']]
    });
    
  
    res.render('holdings/index', {
      holdings,
      brokerList,
      marketCategories,
      broker: brokerFilter,
      market_type: marketTypeFilter,
      moment,
      activePage: 'holdings'
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('❌ Error loading holdings');
  }
};

