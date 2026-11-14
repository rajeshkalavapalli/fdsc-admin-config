// Business rules for sign in and forgot password: lockouts, password checks, OTPs and audit entries.
// No SQL and no req/res here: the database goes through authDA.js, the HTTP side is authHandler.js.
// Each exported function: try → do the work → return the result; catch → log unexpected errors → throw to the handler.
const crypto = require('crypto');
const argon2 = require('argon2');

const { fail, logError } = require('../../utils/access');
const { issueToken, userLimiter, ipLimiter, otpSendLimiter, otpVerifyLimiter } = require('../../utils/auth');
const { minutesText } = require('../../utils/limiter');
const { sendOtpSms } = require('../../utils/sms');
const authDA = require('./authDA');

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

/* ---------------- helpers ---------------- */

const locked = (ms, what) => fail(429, `${what} Try again in ${minutesText(ms)}.`, { retryAfterMs: ms });
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const sameHash = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const strongEnough = (password) => password.length >= 10 && /[a-z]/i.test(password) && /\d/.test(password);
const cleanUser = (value) => String(value || '').trim().toLowerCase();

// A broken or unknown hash counts as a wrong password.
const passwordMatches = async (hash, password) => {
    if (!hash) return false;
    try {
        return await argon2.verify(hash, String(password));
    } catch {
        return false;
    }
};

/* ---------------- sign in ---------------- */

exports.login = async (userName, password, ip) => {
    try {
        const name = cleanUser(userName);
        if (!name || !password) throw fail(400, 'Enter your username and password.');

        // Blocked address or locked username: refuse before checking the password.
        const ipLock = ipLimiter.lockedFor(ip);
        if (ipLock) throw locked(ipLock, 'Too many failed sign-in attempts from this network.');
        const userLock = userLimiter.lockedFor(name);
        if (userLock) throw locked(userLock, 'Too many wrong passwords for this account.');

        const admin = await authDA.getAdminByUserName(name);
        const valid = await passwordMatches(admin?.PasswordHash, password);

        if (!valid) {
            const ipNow = ipLimiter.fail(ip);
            const userNow = userLimiter.fail(name);
            await authDA.audit({ adminId: admin?.AdminId || null, action: 'SIGN_IN_FAILED', details: { userName: name, ip } });
            // The attempt that triggers a lock says so straight away.
            if (ipNow) throw locked(ipNow, 'Too many failed sign-in attempts from this network.');
            if (userNow) throw locked(userNow, 'Too many wrong passwords for this account.');
            throw fail(401, WRONG);
        }

        userLimiter.clear(name);
        await authDA.markSignedIn(admin.AdminId);
        await authDA.audit({ adminId: admin.AdminId, action: 'SIGN_IN', details: { ip } });

        const result = {
            admin: { adminId: admin.AdminId, userName: admin.UserName, name: admin.Name },
            ...issueToken(admin.AdminId),
        };
        return result;
    } catch (err) {
        logError('authService.login', err);
        throw err;
    }
};

exports.getMe = async (adminId) => {
    try {
        const admin = await authDA.getAdmin(adminId);
        if (!admin) throw fail(401, 'Your session has expired. Please sign in again.');
        const result = { admin: { adminId: admin.AdminId, userName: admin.UserName, name: admin.Name, lastLoginOn: admin.LastLoginOn } };
        return result;
    } catch (err) {
        logError('authService.getMe', err);
        throw err;
    }
};

/* ---------------- forgot password (OTP) ---------------- */

// Step 1: send a 6-digit OTP to the admin's registered mobile number.
exports.forgotPassword = async (userName, ip) => {
    try {
        const name = cleanUser(userName);
        if (!name) throw fail(400, 'Enter your username.');

        const ipLock = otpSendLimiter.lockedFor(ip);
        if (ipLock) throw locked(ipLock, 'Too many OTP requests from this network.');
        otpSendLimiter.fail(ip); // every request counts towards the limit

        const admin = await authDA.getAdminForReset(name);
        if (!admin?.Mobile) {
            await authDA.audit({ adminId: admin?.AdminId || null, action: 'OTP_REQUESTED_NO_ACCOUNT', details: { userName: name, ip } });
            return { message: OTP_SENT, resendAfterSeconds: OTP_RESEND_SECONDS };
        }

        // Resend cooldown per account.
        const last = await authDA.getLastOtpSentOn(admin.AdminId);
        const waitMs = last ? new Date(last).getTime() + OTP_RESEND_SECONDS * 1000 - Date.now() : 0;
        if (waitMs > 0) {
            const seconds = Math.ceil(waitMs / 1000);
            throw fail(429, `Please wait ${seconds} seconds before requesting another OTP.`, { retryAfterMs: waitMs });
        }

        const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        await authDA.createOtp({ adminId: admin.AdminId, otpHash: sha256(`${admin.AdminId}:${otp}`), minutes: OTP_MINUTES, ip });
        await sendOtpSms({ mobile: admin.Mobile, otp, minutes: OTP_MINUTES });
        await authDA.audit({ adminId: admin.AdminId, action: 'OTP_SENT', details: { ip } });
        return { message: OTP_SENT, resendAfterSeconds: OTP_RESEND_SECONDS };
    } catch (err) {
        logError('authService.forgotPassword', err);
        throw err;
    }
};

// Step 2: check the OTP. A correct OTP returns a short-lived reset token for step 3.
exports.verifyOtp = async (userName, otp, ip) => {
    try {
        const name = cleanUser(userName);
        const code = String(otp || '').replace(/\D/g, '');
        if (!name || code.length !== 6) throw fail(400, 'Enter the 6-digit OTP.');

        const ipLock = otpVerifyLimiter.lockedFor(ip);
        if (ipLock) throw locked(ipLock, 'Too many wrong OTPs from this network.');

        const admin = await authDA.getAdminForReset(name);
        const live = admin ? await authDA.getLiveOtp(admin.AdminId) : null;
        const correct = live && sameHash(live.OtpHash, sha256(`${admin.AdminId}:${code}`));

        if (!correct) {
            if (live) await authDA.markOtpWrong(live.OtpId, OTP_MAX_ATTEMPTS);
            const ipNow = otpVerifyLimiter.fail(ip);
            await authDA.audit({ adminId: admin?.AdminId || null, action: 'OTP_WRONG', details: { ip } });
            if (ipNow) throw locked(ipNow, 'Too many wrong OTPs from this network.');
            throw fail(400, BAD_OTP);
        }

        const resetToken = crypto.randomBytes(32).toString('base64url');
        const verified = await authDA.markOtpVerified(live.OtpId, sha256(resetToken), RESET_MINUTES);
        if (!verified) throw fail(400, BAD_OTP);
        await authDA.audit({ adminId: admin.AdminId, action: 'OTP_VERIFIED', details: { ip } });
        return { resetToken, expiresInMinutes: RESET_MINUTES };
    } catch (err) {
        logError('authService.verifyOtp', err);
        throw err;
    }
};

// Step 3: set the new password with the reset token from step 2 (works once).
exports.resetPassword = async (resetToken, password, ip) => {
    try {
        if (!resetToken) throw fail(400, BAD_RESET);
        if (!password || !strongEnough(String(password))) throw fail(400, 'Use at least 10 characters, with at least one letter and one digit.');

        const reset = await authDA.getResetByToken(sha256(resetToken));
        if (!reset || !(await authDA.useReset(reset.OtpId))) throw fail(400, BAD_RESET);

        await authDA.setPassword(reset.AdminId, await argon2.hash(String(password)));
        await authDA.audit({ adminId: reset.AdminId, action: 'PASSWORD_RESET', details: { ip } });
        return { message: 'Your password has been changed. Sign in with your new password.' };
    } catch (err) {
        logError('authService.resetPassword', err);
        throw err;
    }
};
