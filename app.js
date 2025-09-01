const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const flash = require('connect-flash');
const formidable = require('express-formidable');

const { sequelize } = require('./models'); 
const pages = require('./routes/pages');
const userRoutes = require('./routes/usersRoutes');
const tradeRoutes = require('./routes/tradeRoutes');

// ⬇️ Passport (Google OAuth) – requires your config/passport.js
const passport = require('./config/passport');

dotenv.config();

const app = express();

// If behind a proxy (NGINX/Cloudflare) and using HTTPS cookies
// app.set('trust proxy', 1);
app.set('trust proxy', 1);

const sessionStore = new SequelizeStore({ db: sequelize });
app.use(session({
  name: 'pn.sid',
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    secure: true,        // true on HTTPS; set false only for local HTTP
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 2
  }
}));
sessionStore.sync();

app.use(cors());

// Parsers
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Flash after session
app.use(flash());

// Passport after session
app.use(passport.initialize());
app.use(passport.session());

// (Optional) keep your existing req.session.user shape in sync
// ✅ corrected sync middleware
app.use((req, _res, next) => {
  if (req.user && !req.session.user) {
    const u = req.user;
    req.session.user = {
      id: u.user_id,
      name: u.full_name || '',
      email: u.email || '',
      role: u.role || 'TRADER'
    };
  }
  next();
});

// Locals
app.use((req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.base_url = 'https://profitnote.acutetech.in/';
  next();
});

// Static
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Optional: only apply formidable to specific upload endpoints instead of globally
// app.use('/api/trade/upload', formidable());

// If you insist on global formidable, put it BEFORE routes but note it can conflict with body-parser on the same endpoints:
/// app.use(formidable());

// Routes (controller-based)
app.get('/', (req, res) => res.redirect('/dashboard'));
app.use('/', pages);
app.use('/api/users', userRoutes);
app.use('/api/trade', tradeRoutes);

// Boot
sequelize.sync().then(() => {
  console.log('✅ DB Synced');
  app.listen(process.env.PORT || 5001, () => {
    console.log(`🚀 Server running on port ${process.env.PORT || 5001}`);
  });
}).catch((err) => {
  console.error('❌ DB Sync Error:', err);
});
