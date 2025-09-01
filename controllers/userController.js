const { User } = require('../models');
const { Op } = require('sequelize');
const bcrypt = require('bcrypt');

// === HTML View Render Handlers ===

// List Users (AdminLTE Table)
exports.renderUserList = async (req, res) => {
  try {
    const users = await User.findAll();
    res.render('users/view', { users });
  } catch (err) {
    req.flash('error', 'Error loading users');
    res.redirect('/admin');
  }
};

// Show Add User Form
exports.renderAddForm = (req, res) => {
  res.render('users/add');
};

// Show Edit User Form
exports.renderEditForm = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      req.flash('error', 'User not found');
      return res.redirect('/admin/users');
    }
    res.render('users/edit', { user });
  } catch (err) {
    req.flash('error', 'Error loading user');
    res.redirect('/admin/users');
  }
};

// Handle Create (Form)
exports.createUser = async (req, res) => {
  const { full_name, email, phone, password, status } = req.body;
  try {
    await User.create({ full_name, email, phone, password, status });
    req.flash('success', 'User created successfully');
    res.redirect('/admin/users');
  } catch (err) {
    req.flash('error', 'Failed to create user');
    res.redirect('/admin/users');
  }
};

// Handle Update (Form)
exports.updateUser = async (req, res) => {
  const { full_name, email, phone, password, status } = req.body;
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      req.flash('error', 'User not found');
      return res.redirect('/admin/users');
    }
    await user.update({ full_name, email, phone, password, status });
    req.flash('success', 'User updated successfully');
    res.redirect('/admin/users');
  } catch (err) {
    req.flash('error', 'Failed to update user');
    res.redirect('/admin/users');
  }
};

// Handle Delete (Form)
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      req.flash('error', 'User not found');
      return res.redirect('/admin/users');
    }
    await user.destroy();
    req.flash('success', 'User deleted successfully');
    res.redirect('/admin/users');
  } catch (err) {
    req.flash('error', 'Failed to delete user');
    res.redirect('/admin/users');
  }
};

// === JSON API Endpoints ===

// API: List Users
exports.listUsers = async (req, res) => {
  try {
    const users = await User.findAll({ attributes: ['user_id', 'full_name', 'email', 'phone', 'status'] });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list users', details: err.message });
  }
};

// API: Get User by ID
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get user', details: err.message });
  }
};

// API: Create User
exports.apiCreateUser = async (req, res) => {
  try {
    const newUser = await User.create(req.body);
    res.status(201).json({ message: 'User created', user: newUser });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create user', details: err.message });
  }
};

// API: Update User
exports.apiUpdateUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    await user.update(req.body);
    res.json({ message: 'User updated', user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user', details: err.message });
  }
};

// API: Delete User
exports.apiDeleteUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    await user.destroy();
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user', details: err.message });
  }
};

exports.affiliatelist = async (req, res) => {
  const currentUserId = req.session.user.id;

  try {
    const user = await User.findByPk(currentUserId);

    if (!user || !user.referral_code) {
      return res.render('affiliate', {
        user,
        referredUsers: [],
        earnings: 0,
        earningsLast7: 0,
        earningsLast30: 0
      });
    }

    const referredUsers = await User.findAll({
      where: { referred_by: user.referral_code },
      order: [['created_at', 'DESC']]
    });

    // Calculate earnings
    const totalReferred = referredUsers.length;
    const earnings = totalReferred * 100;

    const now = new Date();
    const date7 = new Date(now);
    date7.setDate(now.getDate() - 7);
    const date30 = new Date(now);
    date30.setDate(now.getDate() - 30);

    const earningsLast7 = referredUsers.filter(u => new Date(u.created_at) >= date7).length * 100;
    const earningsLast30 = referredUsers.filter(u => new Date(u.created_at) >= date30).length * 100;

    res.render('affiliate', {
      user,
      activePage: 'affiliate',
      referredUsers,
      earnings,
      earningsLast7,
      earningsLast30
    });

  } catch (err) {
    console.error('Affiliate Error:', err);
    res.render('affiliate', {
      user: null,
       activePage: 'affiliate',
     referredUsers: [],
      earnings: 0,
      earningsLast7: 0,
      earningsLast30: 0
    });
  }
};


// Render Edit Profile Page
exports.renderEditProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.session.user.id);
    if (!user) return res.redirect('/login');
    res.render('profile/edit', {
      user,
     // success: req.flash('success'),
     // error: req.flash('error'),
      activePage: ''
    });
  } catch (err) {
    console.error('Error loading profile:', err);
    req.flash('error', 'Failed to load profile');
    res.redirect('/dashboard');
  }
};

// Update Profile Info
exports.updateProfile = async (req, res) => {
  const { full_name, phone } = req.body;
  try {
    const user = await User.findByPk(req.session.user.id);
    if (!user) return res.redirect('/login');

    await user.update({ full_name, phone });
    req.session.user.full_name = full_name; // update session
    req.flash('success', 'Profile updated successfully');
    res.redirect('/profile');
  } catch (err) {
    console.error('Update profile error:', err);
    req.flash('error', 'Failed to update profile');
    res.redirect('/profile');
  }
};

// Change Password
exports.changePassword = async (req, res) => {
  const { current_password, new_password } = req.body;
  try {
    const user = await User.findByPk(req.session.user.id);
    if (!user) return res.redirect('/login');

    const match = await bcrypt.compare(current_password, user.password);
    if (!match) {
      req.flash('error', 'Current password is incorrect');
      return res.redirect('/profile');
    }

    const hashed = await bcrypt.hash(new_password, 10);
    await user.update({ password: hashed });

    req.flash('success', 'Password changed successfully');
    res.redirect('/profile');
  } catch (err) {
    console.error('Password change error:', err);
    req.flash('error', 'Failed to change password');
    res.redirect('/profile');
  }
};

