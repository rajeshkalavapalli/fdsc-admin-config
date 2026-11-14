// An error with an HTTP status and a message that is safe to show to the user.
// `extra` can carry e.g. { retryAfterMs } for locked-out requests.
const fail = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

// Logs an unexpected error once, with where it happened (e.g. "enquiryDA.getEnquiries").
// Errors made by fail() are expected (wrong input, not found...) and are not logged.
// The deepest layer that catches the error logs it; the layers above see `logged` and stay quiet.
const logError = (where, err) => {
    if (err && !err.status && !err.logged) {
        console.log(`error in ${where}`, err);
        err.logged = true;
    }
};

module.exports = { fail, logError };
