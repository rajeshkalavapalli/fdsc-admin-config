// Business rules for enquiries: filters, paging, allowed statuses and the audit trail.
// No SQL and no req/res here: the database goes through enquiryDA.js, the HTTP side is enquiryHandler.js.
// Each exported function: try → do the work → return the result; catch → log unexpected errors → throw to the handler.
const { fail, logError } = require('../../utils/access');
const authDA = require('../Auth/authDA');
const enquiryDA = require('./enquiryDA');

const STATUSES = ['New', 'Contacted', 'Admitted', 'Not interested'];
const COURSES = ['open-10th', 'open-12th', 'intermediate', 'open-degree'];

exports.STATUSES = STATUSES;

/* ---------------- helpers ---------------- */

const toId = (id) => {
    const enquiryId = parseInt(id, 10);
    if (!enquiryId) throw fail(400, 'Unknown enquiry.');
    return enquiryId;
};

// Escape LIKE wildcards in what the admin typed.
const likePattern = (search) => (search ? `%${search.replace(/[[%_]/g, (c) => `[${c}]`)}%` : null);

/* ---------------- enquiries ---------------- */

exports.getEnquiries = async (query) => {
    try {
        const page = Math.max(1, parseInt(query.page, 10) || 1);
        const pageSize = Math.min(100, Math.max(5, parseInt(query.pageSize, 10) || 20));
        const search = String(query.search || '').trim().slice(0, 100);
        const filters = {
            Status: STATUSES.includes(query.status) ? query.status : null,
            Course: COURSES.includes(query.course) ? query.course : null,
            Search: likePattern(search),
        };

        const [items, total] = await Promise.all([
            enquiryDA.getEnquiries(filters, (page - 1) * pageSize, pageSize),
            enquiryDA.countEnquiries(filters),
        ]);
        return { items, total, page, pageSize };
    } catch (err) {
        logError('enquiryService.getEnquiries', err);
        throw err;
    }
};

exports.getSummary = async () => {
    try {
        const { byStatus: rows, today } = await enquiryDA.getSummary();
        const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
        rows.forEach((r) => { byStatus[r.Status] = r.Count; });
        const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
        return { total, today, byStatus, statuses: STATUSES };
    } catch (err) {
        logError('enquiryService.getSummary', err);
        throw err;
    }
};

exports.getRepeats = async (id) => {
    try {
        const enquiryId = toId(id);
        const items = await enquiryDA.getRepeats(enquiryId);
        return { items };
    } catch (err) {
        logError('enquiryService.getRepeats', err);
        throw err;
    }
};

exports.updateEnquiry = async (id, body, adminId) => {
    try {
        const enquiryId = toId(id);
        const status = body.status == null ? null : String(body.status);
        if (status !== null && !STATUSES.includes(status)) throw fail(400, 'Choose a valid status.');
        const notesSet = Object.prototype.hasOwnProperty.call(body, 'notes');
        const notes = notesSet ? String(body.notes || '').trim().slice(0, 1000) || null : null;
        if (status === null && !notesSet) throw fail(400, 'Nothing to update.');

        const updated = await enquiryDA.updateEnquiry({ enquiryId, status, notes, notesSet, adminId });
        if (!updated) throw fail(404, 'That enquiry no longer exists.');
        await authDA.audit({ adminId, action: 'ENQUIRY_UPDATED', details: { enquiryId, status, notesChanged: notesSet } });
        return { ok: true };
    } catch (err) {
        logError('enquiryService.updateEnquiry', err);
        throw err;
    }
};
