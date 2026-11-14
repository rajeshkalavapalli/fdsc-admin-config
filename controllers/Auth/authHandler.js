// HTTP side of sign in and forgot password.
// Each handler: read what the admin panel sent → call ONE service function → send the result.
// Errors: a service error with `status` (from fail()) is a message for the admin; anything else is logged and becomes a 500.
const { sendError, actingAdmin } = require('../../utils/http');
const authService = require('./authService');

exports.login = async (req, res) => {
    try {
        const { userName, password } = req.body || {};
        const result = await authService.login(userName, password, req.ip);
        return res.status(200).json(result);
    } catch (err) {
        return sendError(res, err, 'authHandler.login', 'Failed to sign in.');
    }
};

exports.getMe = async (req, res) => {
    try {
        const adminId = actingAdmin(req);
        const result = await authService.getMe(adminId);
        return res.status(200).json(result);
    } catch (err) {
        return sendError(res, err, 'authHandler.getMe', 'Failed to load your account.');
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const { userName } = req.body || {};
        const result = await authService.forgotPassword(userName, req.ip);
        return res.status(200).json(result);
    } catch (err) {
        return sendError(res, err, 'authHandler.forgotPassword', 'Failed to send the OTP.');
    }
};

exports.verifyOtp = async (req, res) => {
    try {
        const { userName, otp } = req.body || {};
        const result = await authService.verifyOtp(userName, otp, req.ip);
        return res.status(200).json(result);
    } catch (err) {
        return sendError(res, err, 'authHandler.verifyOtp', 'Failed to check the OTP.');
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { resetToken, password } = req.body || {};
        const result = await authService.resetPassword(resetToken, password, req.ip);
        return res.status(200).json(result);
    } catch (err) {
        return sendError(res, err, 'authHandler.resetPassword', 'Failed to reset the password.');
    }
};
