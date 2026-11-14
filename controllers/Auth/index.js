// Routes for sign in, the signed-in admin and forgot password. Routes only: the work is in authHandler.js.
const express = require('express');

const authHandler = require('./authHandler');

const router = express.Router();

// Public: sign in and the three forgot-password steps (see utils/auth.js PUBLIC_ROUTES).
router.post('/login', authHandler.login);
router.post('/forgot-password', authHandler.forgotPassword); // 1. send OTP to the registered mobile
router.post('/verify-otp', authHandler.verifyOtp); //           2. check OTP, get a reset token
router.post('/reset-password', authHandler.resetPassword); //   3. set the new password

// Signed in only.
router.get('/me', authHandler.getMe);

module.exports = router;
