// An error with an HTTP status and a message that is safe to show to the user.
// `extra` can carry e.g. { retryAfterMs } for locked-out requests.
const fail = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

module.exports = { fail };
