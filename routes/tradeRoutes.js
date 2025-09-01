const express = require('express');
const router = express.Router();
const tradeController = require('../controllers/tradeController');

// Trade CRUD
router.get('/', tradeController.listTrades);
router.get('/add', tradeController.renderAddTrade);
router.post('/add', tradeController.saveTrade);
router.get('/edit/:id', tradeController.renderEditTrade);
router.post('/edit/:id', tradeController.updateTrade);
router.get('/delete/:id', tradeController.deleteTrade);

// AJAX: Get brokers based on selected market_type
router.get('/get-brokers', tradeController.getBrokersByMarket);

module.exports = router;
