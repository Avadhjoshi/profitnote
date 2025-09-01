const bcrypt = require('bcrypt');
const { User } = require('../models');

function generateReferCode(name) {
  const initials = name.replace(/\s+/g, '').substring(0, 4).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return initials + random;
}

function getValidTillDate() {
  const now = new Date();
  now.setMonth(now.getMonth() + 1);
  return now.toISOString();
}

// Show login page
exports.loginScreen = async (req, res) => {
  const refer = req.query.refer || '';
  res.render('login', { error: null, refer });
};

// Handle login
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).render('login', {
        error: 'Email and password are required',
        refer: ''
      });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).render('login', {
        error: 'User not found',
        refer: ''
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).render('login', {
        error: 'Invalid password',
        refer: ''
      });
    }

    const now = new Date();
    if (user.valid_till && new Date(user.valid_till) < now) {
      return res.status(403).render('login', {
        error: 'Your account validity has expired. Please contact support.',
        refer: ''
      });
    }

    req.session.user = {
      id: user.user_id,
      name: user.full_name,
      email: user.email,
      role: user.role
    };

    await user.update({ last_login_time: new Date().toISOString() });
    return res.redirect('/dashboard');
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).render('login', {
      error: 'Login failed. Try again later.',
      refer: ''
    });
  }
};

// Show signup page
exports.signupScreen = async (req, res) => {
  const refer = req.query.refer || '';
  res.render('signup', { error: null, refer });
};

// Handle signup
exports.createUser = async (req, res) => {
  try {
    const { registerName, registerEmail, registerPassword, refer_code } = req.body;

    const existing = await User.findOne({ where: { email: registerEmail } });
    if (existing) {
      return res.status(409).render('login', {
        error: 'Email already registered.',
        refer: refer_code || ''
      });
    }

    let referred_by = null;
    if (refer_code) {
      const refUser = await User.findOne({ where: { referral_code: refer_code } });
      if (!refUser) {
        return res.status(400).render('signup', {
          error: 'Invalid referral code.',
          refer: refer_code
        });
      }
      referred_by = refer_code;
    }

    const hashedPassword = await bcrypt.hash(registerPassword, 10);
    const referral_code = generateReferCode(registerName);
    const valid_till = getValidTillDate();

    await User.create({
      full_name: registerName,
      email: registerEmail,
      password: hashedPassword,
      referred_by,
      referral_code,
      valid_till,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    res.redirect('/dashboard');
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).render('login', {
      error: 'Server error during registration',
      refer: refer_code || ''
    });
  }
};
