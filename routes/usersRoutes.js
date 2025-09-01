const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// JSON API Routes
router.get('/', userController.listUsers);
router.get('/:id', userController.getUserById);
router.post('/', userController.apiCreateUser);
router.put('/:id', userController.apiUpdateUser);
router.delete('/:id', userController.apiDeleteUser);

module.exports = router;
