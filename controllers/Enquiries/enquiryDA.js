// Data access for enquiries: runs the queries in sql.js and returns plain rows.
// No business rules here (they are in enquiryService.js).
// Each function: try → run the query → return rows; catch → log which query failed → throw to the service.
const { customQuery, multiQuery } = require('../../utils/dbFunctions');
const { logError } = require('../../utils/access');
const sql = require('./sql');

// One page of enquiries. filters: { Status, Course, Search } (null = any).
exports.getEnquiries = async (filters, offset, pageSize) => {
    try {
        return await customQuery(sql.LIST(), { ...filters, Offset: offset, PageSize: pageSize });
    } catch (err) {
        logError('enquiryDA.getEnquiries', err);
        throw err;
    }
};

// How many enquiries match the same filters (for paging).
exports.countEnquiries = async (filters) => {
    try {
        const rows = await customQuery(sql.COUNT(), filters);
        return rows[0]?.Total || 0;
    } catch (err) {
        logError('enquiryDA.countEnquiries', err);
        throw err;
    }
};

// Counts per status, and how many enquiries came in today.
exports.getSummary = async () => {
    try {
        const [byStatus = [], today = []] = await multiQuery(sql.SUMMARY());
        return { byStatus, today: today[0]?.Today || 0 };
    } catch (err) {
        logError('enquiryDA.getSummary', err);
        throw err;
    }
};

// Later enquiries from the same person that were merged into this one (newest first).
exports.getRepeats = async (enquiryId) => {
    try {
        return await customQuery(sql.REPEATS(), { Id: enquiryId });
    } catch (err) {
        logError('enquiryDA.getRepeats', err);
        throw err;
    }
};

// Status and/or notes. Returns true when the enquiry exists and was updated.
exports.updateEnquiry = async ({ enquiryId, status, notes, notesSet, adminId }) => {
    try {
        const result = await customQuery(sql.UPDATE(), { Id: enquiryId, Status: status, Notes: notes, NotesSet: notesSet ? 1 : 0, AdminId: adminId });
        return Array.isArray(result) ? result[0] > 0 : Boolean(result);
    } catch (err) {
        logError('enquiryDA.updateEnquiry', err);
        throw err;
    }
};
