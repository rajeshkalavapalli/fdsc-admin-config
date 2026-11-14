// Routes for the enquiries pages. Routes only: the work is in enquiryHandler.js.
// All behind authenticate() in app.js (signed-in admins only).
const express = require('express');

const enquiryHandler = require('./enquiryHandler');

const router = express.Router();

router.get('/enquiries', enquiryHandler.getEnquiries);
router.get('/enquiries/summary', enquiryHandler.getSummary);
router.get('/enquiries/:id/repeats', enquiryHandler.getRepeats);
router.patch('/enquiries/:id', enquiryHandler.updateEnquiry);

module.exports = router;
