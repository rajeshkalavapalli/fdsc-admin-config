// Helpers for the handlers (the HTTP side of each controller).
const { logError } = require('./access');

// Sends an error from a handler's catch block.
// Errors from fail() (with `status`) send their own message; anything else is logged and sends `fallback`.
// Locked-out errors (retryAfterMs) also send a Retry-After header and retryAfterSeconds.
const sendError = (res, err, where, fallback) => {
    logError(where, err);
    const body = { message: err.status ? err.message : fallback };
    if (err.retryAfterMs) {
        const seconds = Math.ceil(err.retryAfterMs / 1000);
        res.set('Retry-After', String(seconds));
        body.retryAfterSeconds = seconds;
    }
    return res.status(err.status || 500).json(body);
};

// The signed-in admin (set by authenticate()).
const actingAdmin = (req) => req.admin?.adminId || null;

module.exports = { sendError, actingAdmin };
