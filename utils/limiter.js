// Small in-memory attempt limiter: after `max` failures within `windowMs`, the key is locked
// for `lockMs`. Used for wrong passwords (per username and per IP address) and reset requests.
// Memory-only: a restart clears it. If the API ever runs on several servers, move this to a
// shared store (database or Redis) so every server sees the same counts.

const createLimiter = ({ max, windowMs, lockMs }) => {
    const entries = new Map(); // key -> { count, first, until }

    const norm = (key) => String(key || '').trim().toLowerCase();

    // Milliseconds left on a lock, or 0 if the key may try.
    const lockedFor = (key) => {
        const e = entries.get(norm(key));
        if (!e) return 0;
        if (e.until && e.until > Date.now()) return e.until - Date.now();
        return 0;
    };

    const fail = (key) => {
        const k = norm(key);
        const now = Date.now();
        let e = entries.get(k);
        // Start a fresh window when the old one (or an old lock) has passed.
        if (!e || (e.until && e.until <= now) || (!e.until && now - e.first > windowMs)) e = { count: 0, first: now, until: 0 };
        e.count += 1;
        if (e.count >= max) e.until = now + lockMs;
        entries.set(k, e);
        return e.until ? e.until - now : 0;
    };

    const clear = (key) => entries.delete(norm(key));

    // Drop stale entries now and then so the map can't grow forever.
    setInterval(() => {
        const now = Date.now();
        for (const [k, e] of entries) if ((e.until && e.until <= now) || (!e.until && now - e.first > windowMs)) entries.delete(k);
    }, 10 * 60 * 1000).unref();

    return { lockedFor, fail, clear };
};

const minutesText = (ms) => {
    const m = Math.ceil(ms / 60000);
    return `${m} minute${m === 1 ? '' : 's'}`;
};

module.exports = { createLimiter, minutesText };
