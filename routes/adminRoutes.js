const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const userController = require('../controllers/userController');
const signalController = require('../controllers/signalController');

const { requireAdminLogin } = require('../middleware/authMiddleware');

// Show login form
router.get('/login', (req, res) => {
  res.render('login');
});

// Handle login submission
router.post('/login', adminController.login);

// Protected Dashboard page
router.get('/dashboard', requireAdminLogin, (req, res) => {
  res.render('dashboard', { admin: req.session.admin });
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});


// AdminLTE View Routes
router.get('/users', userController.renderUserList);
router.get('/users/add', userController.renderAddForm);
router.post('/users/add', userController.createUser);
router.get('/users/edit/:id', userController.renderEditForm);
router.post('/users/edit/:id', userController.updateUser);
router.get('/users/delete/:id', userController.deleteUser);


router.get('/signals', signalController.renderSignalList);
router.get('/signals/add', signalController.renderAddForm);
router.post('/signals/add', signalController.createSignal);
router.get('/signals/edit/:id', signalController.renderEditForm);
router.post('/signals/edit/:id', signalController.updateSignal);
router.get('/signals/delete/:id', signalController.deleteSignal);

module.exports = router;
