const crypto = require('crypto');

const { customQuery } = require('./dbFunctions');

// FDSC admin sessions: signed tokens (HMAC-SHA256, JWT layout) with their own secret
// (FDSC_ADMIN_AUTH_SECRET). Same approach as the Pharmalyx platform-admin API.

const TOKEN_TTL_SECONDS = Number(process.env.FDSC_ADMIN_TOKEN_TTL_SECONDS) || 8 * 60 * 60;
const PUBLIC_ROUTES = new Set(['POST /login', 'POST /forgot-password', 'POST /verify-otp', 'POST /reset-password']);

const getSecret = () => {
    const secret = process.env.FDSC_ADMIN_AUTH_SECRET;
    if (!secret || secret.length < 32) throw new Error('FDSC_ADMIN_AUTH_SECRET is missing or shorter than 32 characters.');
    return secret;
};

const base64url = (input) => Buffer.from(input).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');

const issueToken = (adminId) => {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64url(JSON.stringify({ sub: String(adminId), typ: 'fdsc-admin', iat: now, exp: now + TOKEN_TTL_SECONDS }));
    return {
        token: `${header}.${payload}.${sign(`${header}.${payload}`)}`,
        expiresAt: new Date((now + TOKEN_TTL_SECONDS) * 1000).toISOString(),
    };
};

const verifyToken = (token) => {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const expected = Buffer.from(sign(`${header}.${payload}`));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
    try {
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (claims.typ !== 'fdsc-admin' || !claims.sub || !claims.exp || claims.exp <= Math.floor(Date.now() / 1000)) return null;
        return claims;
    } catch {
        return null;
    }
};

// ---------- attempt limits (see utils/limiter.js) ----------
// Per username: 5 wrong passwords within 15 minutes lock that username for 15 minutes.
// Per IP address: 10 failed sign-ins within 15 minutes block that address for 15 minutes,
// whatever username it tries (stops one machine guessing many accounts).
// Forgot-password OTP: 5 OTP requests per IP within 15 minutes, and 10 wrong OTPs per IP
// within 15 minutes, each then blocked for 15 minutes.
const { createLimiter } = require('./limiter');

const FIFTEEN_MIN = 15 * 60 * 1000;
const userLimiter = createLimiter({ max: 5, windowMs: FIFTEEN_MIN, lockMs: FIFTEEN_MIN });
const ipLimiter = createLimiter({ max: 10, windowMs: FIFTEEN_MIN, lockMs: FIFTEEN_MIN });
const otpSendLimiter = createLimiter({ max: 5, windowMs: FIFTEEN_MIN, lockMs: FIFTEEN_MIN });
const otpVerifyLimiter = createLimiter({ max: 10, windowMs: FIFTEEN_MIN, lockMs: FIFTEEN_MIN });

// ---------- every protected request ----------

const authenticate = async (req, res, next) => {
    if (req.method === 'OPTIONS' || PUBLIC_ROUTES.has(`${req.method} ${req.path}`)) return next();

    const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    const claims = match ? verifyToken(match[1].trim()) : null;
    if (!claims) return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });

    try {
        // A deactivated admin is signed out at once.
        const [admin] = await customQuery('SELECT AdminId, Name FROM dbo.Admins WHERE AdminId = @Id AND IsActive = 1', { Id: claims.sub });
        if (!admin) return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
        req.admin = { adminId: claims.sub, name: admin.Name };
        return next();
    } catch (error) {
        console.error('Error checking the session:', error);
        return res.status(500).json({ message: 'Failed to check your session.' });
    }
};

module.exports = { issueToken, verifyToken, authenticate, userLimiter, ipLimiter, otpSendLimiter, otpVerifyLimiter, TOKEN_TTL_SECONDS };
