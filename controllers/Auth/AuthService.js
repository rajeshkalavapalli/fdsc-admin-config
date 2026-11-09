const crypto = require('crypto');
const argon2 = require('argon2');

const { fail } = require('../../utils/access');
const { issueToken, userLimiter, ipLimiter, otpSendLimiter, otpVerifyLimiter } = require('../../utils/auth');
const { minutesText } = require('../../utils/limiter');
const { sendOtpSms } = require('../../utils/sms');
const AuthDA = require('./AuthDA');

// The same message for an unknown username and a wrong password, so usernames can't be probed.
const WRONG = 'Incorrect username or password.';

const OTP_MINUTES = 10; // an OTP is valid for 10 minutes
const OTP_MAX_ATTEMPTS = 5; // 5 wrong tries and that OTP is cancelled
const OTP_RESEND_SECONDS = 60; // wait a minute before asking for another OTP
const RESET_MINUTES = 10; // after a correct OTP, 10 minutes to set the new password
// Same reply whether or not the account exists or has a mobile number (no account probing).
const OTP_SENT = `If that account exists, a 6-digit OTP has been sent to its registered mobile number. It is valid for ${OTP_MINUTES} minutes.`;
const BAD_OTP = 'The OTP is incorrect or has expired. Check it, or request a new one.';
const BAD_RESET = 'Your reset session has expired. Please request a new OTP.';

const locked = (ms, what) => fail(429, `${what} Try again in ${minutesText(ms)}.`, { retryAfterMs: ms });
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const sameHash = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const strongEnough = (password) => password.length >= 10 && /[a-z]/i.test(password) && /\d/.test(password);
const cleanUser = (value) => String(value || '').trim().toLowerCase();

// ---------------------------------------------------------------- sign in

exports.login = async ({ userName, password }, ip) => {
    const name = cleanUser(userName);
    if (!name || !password) throw fail(400, 'Enter your username and password.');

    // Blocked address or locked username: refuse before checking the password.
    const ipLock = ipLimiter.lockedFor(ip);
    if (ipLock) throw locked(ipLock, 'Too many failed sign-in attempts from this network.');
    const userLock = userLimiter.lockedFor(name);
    if (userLock) throw locked(userLock, 'Too many wrong passwords for this account.');

    const admin = await AuthDA.getAdminByUserName(name);
    let valid = false;
    if (admin?.PasswordHash) {
        try {
            valid = await argon2.verify(admin.PasswordHash, String(password));
        } catch {
            valid = false;
        }
    }

    if (!valid) {
        const ipNow = ipLimiter.fail(ip);
        const userNow = userLimiter.fail(name);
        await AuthDA.audit({ adminId: admin?.AdminId || null, action: 'SIGN_IN_FAILED', details: { userName: name, ip } });
        // The attempt that triggers a lock says so straight away.
        if (ipNow) throw locked(ipNow, 'Too many failed sign-in attempts from this network.');
        if (userNow) throw locked(userNow, 'Too many wrong passwords for this account.');
        throw fail(401, WRONG);
    }

    userLimiter.clear(name);
    await AuthDA.markSignedIn(admin.AdminId);
    await AuthDA.audit({ adminId: admin.AdminId, action: 'SIGN_IN', details: { ip } });

    return {
        admin: { adminId: admin.AdminId, userName: admin.UserName, name: admin.Name },
        ...issueToken(admin.AdminId),
    };
};

exports.me = async (adminId) => {
    const admin = await AuthDA.getAdmin(adminId);
    if (!admin) throw fail(401, 'Your session has expired. Please sign in again.');
    return { admin: { adminId: admin.AdminId, userName: admin.UserName, name: admin.Name, lastLoginOn: admin.LastLoginOn } };
};

// ---------------------------------------------------------------- forgot password (OTP)

// Step 1: send a 6-digit OTP to the admin's registered mobile number.
exports.forgotPassword = async ({ userName }, ip) => {
    const name = cleanUser(userName);
    if (!name) throw fail(400, 'Enter your username.');

    const ipLock = otpSendLimiter.lockedFor(ip);
    if (ipLock) throw locked(ipLock, 'Too many OTP requests from this network.');
    otpSendLimiter.fail(ip); // every request counts towards the limit

    const admin = await AuthDA.getAdminForReset(name);
    if (!admin?.Mobile) {
        await AuthDA.audit({ adminId: admin?.AdminId || null, action: 'OTP_REQUESTED_NO_ACCOUNT', details: { userName: name, ip } });
        return { message: OTP_SENT, resendAfterSeconds: OTP_RESEND_SECONDS };
    }

    // Resend cooldown per account.
    const last = await AuthDA.lastOtpSentOn(admin.AdminId);
    const waitMs = last ? new Date(last).getTime() + OTP_RESEND_SECONDS * 1000 - Date.now() : 0;
    if (waitMs > 0) {
        const seconds = Math.ceil(waitMs / 1000);
        throw fail(429, `Please wait ${seconds} seconds before requesting another OTP.`, { retryAfterMs: waitMs });
    }

    const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await AuthDA.createOtp({ adminId: admin.AdminId, otpHash: sha256(`${admin.AdminId}:${otp}`), minutes: OTP_MINUTES, ip });
    await sendOtpSms({ mobile: admin.Mobile, otp, minutes: OTP_MINUTES });
    await AuthDA.audit({ adminId: admin.AdminId, action: 'OTP_SENT', details: { ip } });
    return { message: OTP_SENT, resendAfterSeconds: OTP_RESEND_SECONDS };
};

// Step 2: check the OTP. A correct OTP returns a short-lived reset token for step 3.
exports.verifyOtp = async ({ userName, otp }, ip) => {
    const name = cleanUser(userName);
    const code = String(otp || '').replace(/\D/g, '');
    if (!name || code.length !== 6) throw fail(400, 'Enter the 6-digit OTP.');

    const ipLock = otpVerifyLimiter.lockedFor(ip);
    if (ipLock) throw locked(ipLock, 'Too many wrong OTPs from this network.');

    const admin = await AuthDA.getAdminForReset(name);
    const live = admin ? await AuthDA.getLiveOtp(admin.AdminId) : null;
    const correct = live && sameHash(live.OtpHash, sha256(`${admin.AdminId}:${code}`));

    if (!correct) {
        if (live) await AuthDA.otpWrong(live.OtpId, OTP_MAX_ATTEMPTS);
        const ipNow = otpVerifyLimiter.fail(ip);
        await AuthDA.audit({ adminId: admin?.AdminId || null, action: 'OTP_WRONG', details: { ip } });
        if (ipNow) throw locked(ipNow, 'Too many wrong OTPs from this network.');
        throw fail(400, BAD_OTP);
    }

    const resetToken = crypto.randomBytes(32).toString('base64url');
    if (!(await AuthDA.otpVerified(live.OtpId, sha256(resetToken), RESET_MINUTES))) throw fail(400, BAD_OTP);
    await AuthDA.audit({ adminId: admin.AdminId, action: 'OTP_VERIFIED', details: { ip } });
    return { resetToken, expiresInMinutes: RESET_MINUTES };
};

// Step 3: set the new password with the reset token from step 2 (works once).
exports.resetPassword = async ({ resetToken, password }, ip) => {
    if (!resetToken) throw fail(400, BAD_RESET);
    if (!password || !strongEnough(String(password))) throw fail(400, 'Use at least 10 characters, with at least one letter and one digit.');

    const reset = await AuthDA.getResetByToken(sha256(resetToken));
    if (!reset || !(await AuthDA.useReset(reset.OtpId))) throw fail(400, BAD_RESET);

    await AuthDA.setPassword(reset.AdminId, await argon2.hash(String(password)));
    await AuthDA.audit({ adminId: reset.AdminId, action: 'PASSWORD_RESET', details: { ip } });
    return { message: 'Your password has been changed. Sign in with your new password.' };
};
