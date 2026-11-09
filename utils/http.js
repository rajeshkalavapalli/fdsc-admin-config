// Standard handler wrapper: runs `work(req)` and sends its result, or a clean error.
// Errors with a `status` (from utils/access `fail`) show their own message;
// anything else becomes "Failed to <label>." and is logged.
// Locked-out errors (retryAfterMs) also send a Retry-After header and retryAfterSeconds.
const handle = (label, work, successStatus = 200) => async (req, res) => {
    try {
        const result = await work(req);
        return res.status(successStatus).json(result);
    } catch (error) {
        if (!error.status) console.error(`Error trying to ${label}:`, error);
        const body = { message: error.status ? error.message : `Failed to ${label}.` };
        if (error.retryAfterMs) {
            const seconds = Math.ceil(error.retryAfterMs / 1000);
            res.set('Retry-After', String(seconds));
            body.retryAfterSeconds = seconds;
        }
        return res.status(error.status || 500).json(body);
    }
};

// The signed-in admin (set by authenticate()).
const actingAdmin = (req) => req.admin?.adminId || null;

module.exports = { handle, actingAdmin };
