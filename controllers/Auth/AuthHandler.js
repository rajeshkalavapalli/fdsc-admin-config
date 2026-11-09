const { handle, actingAdmin } = require('../../utils/http');
const AuthService = require('./AuthService');

exports.login = handle('sign in', (req) => AuthService.login(req.body || {}, req.ip));
exports.me = handle('load your account', (req) => AuthService.me(actingAdmin(req)));
exports.forgotPassword = handle('send the OTP', (req) => AuthService.forgotPassword(req.body || {}, req.ip));
exports.verifyOtp = handle('check the OTP', (req) => AuthService.verifyOtp(req.body || {}, req.ip));
exports.resetPassword = handle('reset the password', (req) => AuthService.resetPassword(req.body || {}, req.ip));
