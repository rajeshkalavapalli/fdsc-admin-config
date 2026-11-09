const express = require('express');

const router = express.Router();

const Auth = require('./AuthHandler');

// Public: sign in and the three forgot-password steps (see utils/auth.js PUBLIC_ROUTES).
router.post('/login', Auth.login);
router.post('/forgot-password', Auth.forgotPassword); // 1. send OTP to the registered mobile
router.post('/verify-otp', Auth.verifyOtp); //           2. check OTP, get a reset token
router.post('/reset-password', Auth.resetPassword); //   3. set the new password
router.get('/me', Auth.me);

module.exports = router;
