// config/passport.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { User } = require('../models');

// --- serialize/deserialize using user_id ---
passport.serializeUser((user, done) => {
  const uid = user?.user_id ?? user?.dataValues?.user_id;
  if (!uid) return done(new Error('No user_id to serialize'));
  done(null, uid);
});

passport.deserializeUser(async (id, done) => {
  try {
    const u = await User.findByPk(id);
    if (!u) return done(new Error('User not found during deserialize'));
    done(null, u);
  } catch (e) {
    done(e);
  }
});

// --- Google OAuth strategy ---
passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  },
  async (_accessToken, _refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value || null;
      const full_name = profile.displayName || null;
      const google_id = profile.id;

      // 1) find by google_id
      let user = await User.findOne({ where: { google_id } });

      // 2) else by email (unique in your model)
      if (!user && email) {
        user = await User.findOne({ where: { email } });
      }

      // 3) update / create
      if (user) {
        const updates = {};
        if (!user.google_id) updates.google_id = google_id;
        if (!user.full_name && full_name) updates.full_name = full_name;
        if (Object.keys(updates).length) await user.update(updates);
      } else {
        user = await User.create({
          google_id,
          email,
          full_name,
          status: 'ACTIVE',   // optional defaults
          role: 'TRADER'
        });
      }

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

module.exports = passport;
