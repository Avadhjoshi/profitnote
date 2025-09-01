// controllers/AuthController.js
const passport = require('../config/passport');

// GET /auth/google
exports.googleLogin = passport.authenticate('google', { scope: ['profile', 'email'] });

// GET /auth/google/callback
exports.googleCallback = (req, res, next) => {
  passport.authenticate('google', { failureRedirect: '/login' }, (err, user) => {
    if (err) return next(err);
    if (!user) return res.redirect('/login');

    req.logIn(user, (err2) => {
      if (err2) return next(err2);

      // Normalize to your app’s session shape
      req.session.user = {
        id: user.user_id,                  // <- PK from model
        name: user.full_name || '',        // <- your model field
        email: user.email || '',
        role: user.role || 'TRADER'
      };
 console.error('✅ Google user found:', {
      user_id: user.user_id,
      full_name: user.full_name,
      email: user.email,
      role: user.role
    });

      // ensure the session is stored before redirect
      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        return res.redirect('/dashboard');
      });
    });
  })(req, res, next);
};

// GET /logout
exports.logout = (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    req.session.destroy(() => res.redirect('/login'));
  });
};
