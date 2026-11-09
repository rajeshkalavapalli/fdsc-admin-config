const db = require('../db');

const addInputs = (request, inputs) => Object.entries(inputs).forEach(([name, value]) => request.input(name, value));

// One parameterised query. Returns the rows (or rows affected for writes).
const customQuery = async (sqlQuery, inputs = {}) => {
    const pool = await db.poolPromise;
    const request = pool.request();
    addInputs(request, inputs);
    const result = await request.query(sqlQuery);
    return result.recordset ?? result.rowsAffected ?? result;
};

module.exports = { customQuery };
