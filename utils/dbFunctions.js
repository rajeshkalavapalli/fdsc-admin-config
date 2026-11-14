// Raw-query helpers (same shape as Pharmalyx / Kiran Book Center).
//   customQuery(sql, inputs)   one statement batch: the rows (or rows affected for writes)
//   multiQuery(sql, inputs)    a batch with several SELECTs: every recordset, in order
const db = require('../db');

const addInputs = (request, inputs) => Object.entries(inputs).forEach(([name, value]) => request.input(name, value === undefined ? null : value));

const customQuery = async (sqlQuery, inputs = {}) => {
    const pool = await db.poolPromise;
    const request = pool.request();
    addInputs(request, inputs);
    const result = await request.query(sqlQuery);
    return result.recordset ?? result.rowsAffected ?? result;
};

const multiQuery = async (sqlQuery, inputs = {}) => {
    const pool = await db.poolPromise;
    const request = pool.request();
    addInputs(request, inputs);
    const result = await request.query(sqlQuery);
    return result.recordsets || [];
};

module.exports = { customQuery, multiQuery };
