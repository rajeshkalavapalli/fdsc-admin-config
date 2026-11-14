// Data access for admins, sign in and forgot password: runs the queries in sql.js and returns plain rows.
// No business rules here (they are in authService.js).
// Each function: try → run the query → return rows; catch → log which query failed → throw to the service.
const { customQuery } = require('../../utils/dbFunctions');
const { logError } = require('../../utils/access');
const sql = require('./sql');

// UPDATE results come back as rowsAffected ([n]); true when at least one row changed.
const changed = (result) => (Array.isArray(result) ? result[0] > 0 : Boolean(result));

/* ---------------- admins ---------------- */

exports.getAdminByUserName = async (userName) => {
    try {
        const rows = await customQuery(sql.GET_ADMIN_BY_USERNAME(), { UserName: userName });
        return rows[0] || null;
    } catch (err) {
        logError('authDA.getAdminByUserName', err);
        throw err;
    }
};

exports.getAdmin = async (adminId) => {
    try {
        const rows = await customQuery(sql.GET_ADMIN(), { Id: adminId });
        return rows[0] || null;
    } catch (err) {
        logError('authDA.getAdmin', err);
        throw err;
    }
};

exports.getAdminForReset = async (userName) => {
    try {
        const rows = await customQuery(sql.GET_ADMIN_FOR_RESET(), { UserName: userName });
        return rows[0] || null;
    } catch (err) {
        logError('authDA.getAdminForReset', err);
        throw err;
    }
};

exports.markSignedIn = async (adminId) => {
    try {
        return await customQuery(sql.MARK_SIGNED_IN(), { Id: adminId });
    } catch (err) {
        logError('authDA.markSignedIn', err);
        throw err;
    }
};

exports.setPassword = async (adminId, hash) => {
    try {
        return await customQuery(sql.SET_PASSWORD(), { Id: adminId, Hash: hash });
    } catch (err) {
        logError('authDA.setPassword', err);
        throw err;
    }
};

/* ---------------- forgot-password OTPs ---------------- */

exports.getLastOtpSentOn = async (adminId) => {
    try {
        const rows = await customQuery(sql.LAST_OTP_SENT(), { AdminId: adminId });
        return rows[0]?.CreatedOn || null;
    } catch (err) {
        logError('authDA.getLastOtpSentOn', err);
        throw err;
    }
};

// One live OTP per admin: older ones are retired first.
exports.createOtp = async ({ adminId, otpHash, minutes, ip }) => {
    try {
        await customQuery(sql.RETIRE_OTPS(), { AdminId: adminId });
        return await customQuery(sql.INSERT_OTP(), { AdminId: adminId, OtpHash: otpHash, Minutes: minutes, RequestIp: ip });
    } catch (err) {
        logError('authDA.createOtp', err);
        throw err;
    }
};

exports.getLiveOtp = async (adminId) => {
    try {
        const rows = await customQuery(sql.GET_LIVE_OTP(), { AdminId: adminId });
        return rows[0] || null;
    } catch (err) {
        logError('authDA.getLiveOtp', err);
        throw err;
    }
};

exports.markOtpWrong = async (otpId, maxAttempts) => {
    try {
        return await customQuery(sql.OTP_WRONG(), { OtpId: otpId, MaxAttempts: maxAttempts });
    } catch (err) {
        logError('authDA.markOtpWrong', err);
        throw err;
    }
};

// True only if this request verified the OTP (it can be verified once).
exports.markOtpVerified = async (otpId, tokenHash, minutes) => {
    try {
        const result = await customQuery(sql.OTP_VERIFIED(), { OtpId: otpId, TokenHash: tokenHash, Minutes: minutes });
        return changed(result);
    } catch (err) {
        logError('authDA.markOtpVerified', err);
        throw err;
    }
};

exports.getResetByToken = async (tokenHash) => {
    try {
        const rows = await customQuery(sql.GET_RESET_BY_TOKEN(), { TokenHash: tokenHash });
        return rows[0] || null;
    } catch (err) {
        logError('authDA.getResetByToken', err);
        throw err;
    }
};

// True only for the request that actually marks the reset used, so a token works once.
exports.useReset = async (otpId) => {
    try {
        const result = await customQuery(sql.USE_RESET(), { OtpId: otpId });
        return changed(result);
    } catch (err) {
        logError('authDA.useReset', err);
        throw err;
    }
};

/* ---------------- audit trail ---------------- */

// A failed audit entry is logged but never stops the action itself.
exports.audit = async ({ adminId = null, action, details = null }) => {
    try {
        await customQuery(sql.INSERT_AUDIT(), {
            AdminId: adminId,
            Action: action,
            Details: details == null ? null : JSON.stringify(details),
        });
    } catch (err) {
        console.log(`error in authDA.audit (${action} not recorded)`, err.message);
    }
};
