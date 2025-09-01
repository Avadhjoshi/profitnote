const express = require('express');
const router = express.Router();
const { requireAdminLogin } = require('../middleware/authMiddleware');
const adminController = require('../controllers/adminController');
const tradeController = require('../controllers/tradeController');
const strategyController = require('../controllers/strategyController');
const calendarController = require('../controllers/calendarController');
const zerodhaController = require('../controllers/zerodhaController');
const brokerController = require('../controllers/brokerController');
const deltaController = require('../controllers/deltaController');
const userController =  require('../controllers/userController');
const angelController = require('../controllers/angelController');
const dhanController = require('../controllers/dhanController');
const dhantest = require('../controllers/dhantest');
const aiController = require("../controllers/aiController");
const authController = require('../controllers/authController');

const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // Ensure this directory exists
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now();
    
    // Get file extension safely
    const ext = path.extname(file.originalname);
    
    // Get base name and sanitize it (remove special characters, keep a-z, A-Z, 0-9, hyphen and underscore)
    const baseName = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9-_]/g, '')  // Remove special characters
      .toLowerCase();

    // Final filename: timestamp-cleanname.ext
    const safeFileName = `${uniqueSuffix}-${baseName}${ext}`;
    cb(null, safeFileName);
  }
});

const upload = multer({ storage });



// ✅ Global session -> user injection
router.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});
// DASHBOARD & CORE ROUTES
router.get('/', requireAdminLogin, (req, res) => res.render('dashboard', { activePage: 'dashboard' }));
router.get('/dashboard', requireAdminLogin,tradeController.renderDashboard);

// AI – Pre-trade check (dashboard modal posts here)
router.post('/ai/trade-check', requireAdminLogin, aiController.preTradeCheck);
router.get("/ai/analyze-holdings", aiController.analyzeHoldings);
router.get("/ai/analyze-trades", aiController.analyzeTrades);
router.get("/ai-reports", aiController.renderAIReports);
router.get("/ai-trade-reports", aiController.renderAITradeReports);
router.get("/chart-analyzer", aiController.chartAnalyze);
router.post('/analyze-chart', upload.single('chart'), aiController.analyzeChart);
router.get('/chart-history', aiController.getAllChartReports);

// TRADE ROUTES
router.get('/trades', requireAdminLogin, tradeController.listTrades);
router.get('/trades/add', requireAdminLogin, tradeController.renderAddTrade);
router.post('/trades/add', requireAdminLogin, upload.array('screenshots[]'), tradeController.saveTrade);
router.get('/trades/edit/:id', requireAdminLogin, tradeController.renderEditTrade);
router.post('/trades/edit/:id', requireAdminLogin,upload.array('screenshots[]'), tradeController.updateTrade);
router.get('/trades/delete/:id', requireAdminLogin, tradeController.deleteTrade);
router.get('/trades/get-brokers',requireAdminLogin, tradeController.getBrokersByMarket);
router.post('/trades/delete-screenshot', requireAdminLogin,tradeController.deleteScreenshot);
router.get('/trades/day', requireAdminLogin, tradeController.renderTradesByDay);

//google login routes
router.get('/auth/google', authController.googleLogin);
router.get('/auth/google/callback', authController.googleCallback);


router.get('/reports', requireAdminLogin,tradeController.renderReportDashboard);
router.get('/signals', requireAdminLogin,tradeController.renderSignals);

// strategies ROUTES
router.get('/strategies', requireAdminLogin, strategyController.listStrategies);
router.get('/strategies/add', requireAdminLogin, strategyController.renderAddStrategy);
router.post('/strategies/add', requireAdminLogin,upload.none(), strategyController.saveStrategy);
router.get('/strategies/edit/:id', requireAdminLogin, strategyController.renderEditStrategy);
router.post('/strategies/edit/:id', requireAdminLogin, upload.none(),strategyController.updateStrategy);
router.get('/strategies/delete/:id', requireAdminLogin, strategyController.deleteStrategy);
router.get('/strategies/api/:id', requireAdminLogin, strategyController.getStrategyJson);


router.get('/credentials', requireAdminLogin,brokerController.showCredentialsForm);
router.post('/credentials/save',multer().none(), brokerController.saveCredentials);
router.post('/credentials/delete', requireAdminLogin,brokerController.deleteCredentials);

router.get('/holdings', brokerController.viewHoldings);

//zerodha 
router.get('/zerodha/callback', requireAdminLogin, zerodhaController.handleZerodhaCallback);
router.get('/credentials/zerodha/login', requireAdminLogin, zerodhaController.redirectToZerodhaLogin);
router.get('/credentials/sync-zerodha', requireAdminLogin, zerodhaController.syncZerodhaTrades);
router.get('/credentials/sync-zerodha-holdings', zerodhaController.syncZerodhaHoldings);

router.get('/credentials/sync-dhan', dhantest.fetchDhanData);
router.get('/credentials/sync-dhan-holdings', dhanController.syncDhanHoldings);

router.get('/credentials/sync-delta', requireAdminLogin, deltaController.syncDeltaTrades);

router.get('/credentials/angel/login', requireAdminLogin, angelController.redirectToAngelLogin);
router.get('/angel-one/callback', requireAdminLogin, angelController.handleAngelCallback);
router.get('/credentials/sync-angel-trades', requireAdminLogin, angelController.syncAngelTrades);
router.get('/credentials/sync-angel-holdings', requireAdminLogin, angelController.syncAngelHoldings);
router.get('/angel/sync-scrips', angelController.syncAngelScripMaster);
router.get('/update-ltp', angelController.updateMissingLTPFromAngel);

// TOOLS & TABS
router.get('/calendar', requireAdminLogin, calendarController.renderCalendar);
router.get('/tools', requireAdminLogin, (req, res) => res.render('tools', { activePage: 'tools' }));
router.get('/challenge', requireAdminLogin, (req, res) => res.render('challenge', { activePage: 'challenge' }));
//router.get('/reports', requireAdminLogin, (req, res) => res.render('reports', { activePage: 'reports' }));
router.get('/affiliate', requireAdminLogin,userController.affiliatelist);

router.get('/tutorials', requireAdminLogin, (req, res) => res.render('tutorials', { activePage: 'tutorials' }));

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

router.get('/login', adminController.loginScreen);
router.post('/login', adminController.login);

router.get('/signup', adminController.signupScreen);
router.post('/signup', adminController.createUser);


router.get('/profile', requireAdminLogin,userController.renderEditProfile);
router.post('/profile/update', requireAdminLogin, userController.updateProfile);
router.post('/profile/change-password', requireAdminLogin, userController.changePassword);


module.exports = router;
