// Raw-query helpers (same shape as Pharmalyx / Kiran Book Center).
//   customQuery(sql, inputs)   one statement batch: the rows (or rows affected for writes)
//   multiQuery(sql, inputs)    a batch with several SELECTs: every recordset, in order
//
// Azure SQL (free serverless) pauses when idle and needs up to about a minute to wake up.
// While it wakes, or during a short Azure failover, queries fail with "temporary" errors.
// Those are retried automatically (about 90 s in total), so staff just wait a little longer.
const db = require('../db');

const TEMPORARY_SQL_ERRORS = new Set([40613, 40197, 40501, 49918, 49919, 49920, 4060, 4221, 10928, 10929, 233, 64, 10053, 10054, 10060]);
const TEMPORARY_CODES = new Set(['ESOCKET', 'ETIMEOUT', 'ECONNRESET', 'ECONNCLOSED', 'ENOTOPEN', 'ELOGIN']);
const RETRY_DELAYS_MS = [2000, 4000, 8000, 15000, 20000, 20000, 20000];

const isTemporary = (err) => {
    const number = err?.number ?? err?.originalError?.info?.number;
    if (TEMPORARY_SQL_ERRORS.has(number)) return true;
    // A wrong password is also ELOGIN: only retry ELOGIN when the message says the database is waking up.
    if (err?.code === 'ELOGIN') return /not currently available|paused|resum/i.test(err.message || '');
    return TEMPORARY_CODES.has(err?.code);
};

const withRetry = async (work) => {
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await work();
        } catch (err) {
            if (!isTemporary(err) || attempt >= RETRY_DELAYS_MS.length) throw err;
            const wait = RETRY_DELAYS_MS[attempt];
            console.log(`Database busy or waking up (${err.code || err.number}). Retrying in ${wait / 1000} s.`);
            await new Promise((resolve) => setTimeout(resolve, wait));
        }
    }
};

const addInputs = (request, inputs) => Object.entries(inputs).forEach(([name, value]) => request.input(name, value === undefined ? null : value));

const customQuery = (sqlQuery, inputs = {}) =>
    withRetry(async () => {
        const pool = await db.poolPromise;
        const request = pool.request();
        addInputs(request, inputs);
        const result = await request.query(sqlQuery);
        return result.recordset ?? result.rowsAffected ?? result;
    });

const multiQuery = (sqlQuery, inputs = {}) =>
    withRetry(async () => {
        const pool = await db.poolPromise;
        const request = pool.request();
        addInputs(request, inputs);
        const result = await request.query(sqlQuery);
        return result.recordsets || [];
    });

module.exports = { customQuery, multiQuery };
