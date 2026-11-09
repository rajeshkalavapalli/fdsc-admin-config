const { customQuery } = require('../../utils/dbFunctions');
const sql = require('./sql');

const affected = (result) => (Array.isArray(result) ? result[0] > 0 : Boolean(result));

exports.getAdminByUserName = async (userName) => (await customQuery(sql.GET_ADMIN_BY_USERNAME(), { UserName: userName }))[0] || null;
exports.getAdmin = async (id) => (await customQuery(sql.GET_ADMIN(), { Id: id }))[0] || null;
exports.getAdminForReset = async (userName) => (await customQuery(sql.GET_ADMIN_FOR_RESET(), { UserName: userName }))[0] || null;
exports.markSignedIn = (id) => customQuery(sql.MARK_SIGNED_IN(), { Id: id });
exports.setPassword = (id, hash) => customQuery(sql.SET_PASSWORD(), { Id: id, Hash: hash });

exports.lastOtpSentOn = async (adminId) => (await customQuery(sql.LAST_OTP_SENT(), { AdminId: adminId }))[0]?.CreatedOn || null;
exports.createOtp = async ({ adminId, otpHash, minutes, ip }) => {
    await customQuery(sql.RETIRE_OTPS(), { AdminId: adminId });
    await customQuery(sql.INSERT_OTP(), { AdminId: adminId, OtpHash: otpHash, Minutes: minutes, RequestIp: ip });
};
exports.getLiveOtp = async (adminId) => (await customQuery(sql.GET_LIVE_OTP(), { AdminId: adminId }))[0] || null;
exports.otpWrong = (otpId, maxAttempts) => customQuery(sql.OTP_WRONG(), { OtpId: otpId, MaxAttempts: maxAttempts });
exports.otpVerified = async (otpId, tokenHash, minutes) => affected(await customQuery(sql.OTP_VERIFIED(), { OtpId: otpId, TokenHash: tokenHash, Minutes: minutes }));
exports.getResetByToken = async (tokenHash) => (await customQuery(sql.GET_RESET_BY_TOKEN(), { TokenHash: tokenHash }))[0] || null;
// True only for the request that actually marks the reset used, so a token works once.
exports.useReset = async (otpId) => affected(await customQuery(sql.USE_RESET(), { OtpId: otpId }));

// Admin audit trail. A failure here is logged, never thrown.
exports.audit = async ({ adminId = null, action, details = null }) => {
    try {
        await customQuery(sql.INSERT_AUDIT(), {
            AdminId: adminId,
            Action: action,
            Details: details == null ? null : JSON.stringify(details),
        });
    } catch (error) {
        console.error(`Admin audit not recorded (${action}):`, error.message);
    }
};
