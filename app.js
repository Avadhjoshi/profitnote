// app.js
require('dotenv').config();            // Load env first (so you can use them below)
require('./utils/http');           // <— switches fetch() to Undici keep-alive

const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const flash = require('connect-flash');
const bodyParser = require('body-parser');        // only for urlencoded forms
const formidable = require('express-formidable'); // keep route-scoped if possible

// DB + routes
const { sequelize } = require('./models');
const pages = require('./routes/pages');
const userRoutes = require('./routes/usersRoutes');
const tradeRoutes = require('./routes/tradeRoutes');

// Auth (Passport)
const passport = require('./config/passport');

const app = express();
const isProd = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 5001;

// If behind a proxy/HTTPS terminator (NGINX/Cloudflare), keep this ON
app.set('trust proxy', 1);

/* ================= Session ================= */
const sessionStore = new SequelizeStore({ db: sequelize });

// Cross-site cookie support toggle (when frontend is on a different domain)
// Set CROSS_SITE_COOKIES=true in env to enable SameSite=None; Secure
const crossSite = String(process.env.CROSS_SITE_COOKIES || '').toLowerCase() === 'true';

app.use(session({
  name: 'pn.sid',
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    // 'secure' must be true for SameSite=None, and requires HTTPS
    secure: crossSite ? true : isProd,
    httpOnly: true,
    sameSite: crossSite ? 'none' : 'lax',
    maxAge: 1000 * 60 * 60 * 2 // 2 hours
  }
}));
sessionStore.sync();

/* ================= CORS ================= */
// If your frontend is on another origin, set WEB_ORIGIN (or comma-separated list)
const origins = (process.env.WEB_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (origins.length > 0) {
  app.use(cors({
    origin: origins,
    credentials: true
  }));
} else {
  // Same-origin or unknown—allow basic CORS without credentials
  app.use(cors());
}

/* ================= Parsers ================= */
// Use ONE JSON parser (prefer express.json)
app.use(express.json({ limit: '1mb' }));
// Keep urlencoded if you accept HTML forms
app.use(bodyParser.urlencoded({ extended: true }));

// Route-scoped formidable is safer (global can conflict with body parsers)
// Example (uncomment in your upload route file instead):
// app.use('/api/trade/upload', formidable());

/* ================= Flash & Auth ================= */
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());

// Keep your session.user in sync with Passport user
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

/* ================= Locals ================= */
app.use((req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  // adjust to your public URL if needed
  res.locals.base_url = process.env.PUBLIC_BASE_URL || 'https://profitnote.acutetech.in/';
  next();
});

/* ================= Static ================= */
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets'), {
  maxAge: '30d',
  immutable: true
}));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), {
  maxAge: '7d',
  immutable: true
}));

/* ================= Views ================= */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

/* ================= Routes ================= */
app.get('/', (req, res) => res.redirect('/dashboard'));
app.use('/', pages);
app.use('/api/users', userRoutes);
app.use('/api/trade', tradeRoutes);

/* ================= Boot ================= */
sequelize.sync()
  .then(() => {
    console.log('✅ DB Synced');
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      if (!isProd) {
        console.log(`ℹ️  CORS origins: ${origins.length ? origins.join(', ') : 'default'}`);
        console.log(`ℹ️  Cookies: SameSite=${crossSite ? 'none' : 'lax'}, Secure=${crossSite ? 'true' : String(isProd)}`);
      }
    });
  })
  .catch((err) => {
    console.error('❌ DB Sync Error:', err);
    process.exit(1);
  });
