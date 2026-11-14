// HTTP side of the enquiries pages in the admin panel.
// Each handler: read what the admin panel sent → call ONE service function → send the result.
// Errors: a service error with `status` (from fail()) is a message for the admin; anything else is logged and becomes a 500.
const { sendError, actingAdmin } = require('../../utils/http');
const enquiryService = require('./enquiryService');

exports.getEnquiries = async (req, res) => {
    try {
        const result = await enquiryService.getEnquiries(req.query || {});
        return res.status(200).json(result);
    } catch (err) {
        return sendError(res, err, 'enquiryHandler.getEnquiries', 'Failed to load enquiries.');
    }
};

exports.getSummary = async (req, res) => {
    try {
        const result = await enquiryService.getSummary();
        return res.status(200).json(result);
    } catch (err) {
        return sendError(res, err, 'enquiryHandler.getSummary', 'Failed to load the enquiry summary.');
    }
};

exports.getRepeats = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await enquiryService.getRepeats(id);
        return res.status(200).json(result);
    } catch (err) {
        return sendError(res, err, 'enquiryHandler.getRepeats', 'Failed to load the earlier messages.');
    }
};

exports.updateEnquiry = async (req, res) => {
    try {
        const { id } = req.params;
        const adminId = actingAdmin(req);
        const result = await enquiryService.updateEnquiry(id, req.body || {}, adminId);
        return res.status(200).json(result);
    } catch (err) {
        return sendError(res, err, 'enquiryHandler.updateEnquiry', 'Failed to update the enquiry.');
    }
};
