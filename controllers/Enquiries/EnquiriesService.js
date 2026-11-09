const db = require('../../db');
const { customQuery } = require('../../utils/dbFunctions');
const { fail } = require('../../utils/access');
const AuthDA = require('../Auth/AuthDA');
const sql = require('./sql');

const STATUSES = ['New', 'Contacted', 'Admitted', 'Not interested'];
const COURSES = ['open-10th', 'open-12th', 'intermediate', 'open-degree'];

exports.STATUSES = STATUSES;

exports.list = async (query) => {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(5, parseInt(query.pageSize, 10) || 20));
    const search = String(query.search || '').trim().slice(0, 100);
    const inputs = {
        Status: STATUSES.includes(query.status) ? query.status : null,
        Course: COURSES.includes(query.course) ? query.course : null,
        // Escape LIKE wildcards in what the admin typed.
        Search: search ? `%${search.replace(/[[%_]/g, (c) => `[${c}]`)}%` : null,
    };
    const [rows, [{ Total }]] = await Promise.all([
        customQuery(sql.LIST(), { ...inputs, Offset: (page - 1) * pageSize, PageSize: pageSize }),
        customQuery(sql.COUNT(), inputs),
    ]);
    return { items: rows, total: Total, page, pageSize };
};

exports.summary = async () => {
    const pool = await db.poolPromise;
    const result = await pool.request().query(sql.SUMMARY());
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    result.recordsets[0].forEach((r) => { byStatus[r.Status] = r.Count; });
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    return { total, today: result.recordsets[1][0].Today, byStatus, statuses: STATUSES };
};

exports.repeats = async (id) => {
    const enquiryId = parseInt(id, 10);
    if (!enquiryId) throw fail(400, 'Unknown enquiry.');
    return { items: await customQuery(sql.REPEATS(), { Id: enquiryId }) };
};

exports.update = async (id, body, adminId) => {
    const enquiryId = parseInt(id, 10);
    if (!enquiryId) throw fail(400, 'Unknown enquiry.');
    const status = body.status == null ? null : String(body.status);
    if (status !== null && !STATUSES.includes(status)) throw fail(400, 'Choose a valid status.');
    const notesSet = Object.prototype.hasOwnProperty.call(body, 'notes');
    const notes = notesSet ? String(body.notes || '').trim().slice(0, 1000) || null : null;
    if (status === null && !notesSet) throw fail(400, 'Nothing to update.');

    const affected = await customQuery(sql.UPDATE(), { Id: enquiryId, Status: status, Notes: notes, NotesSet: notesSet ? 1 : 0, AdminId: adminId });
    if (!(Array.isArray(affected) ? affected[0] : affected)) throw fail(404, 'That enquiry no longer exists.');
    await AuthDA.audit({ adminId, action: 'ENQUIRY_UPDATED', details: { enquiryId, status, notesChanged: notesSet } });
    return { ok: true };
};
