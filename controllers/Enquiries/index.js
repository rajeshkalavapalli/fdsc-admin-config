const express = require('express');
const { handle, actingAdmin } = require('../../utils/http');
const EnquiriesService = require('./EnquiriesService');

const router = express.Router();

// All behind authenticate() (signed-in admins only).
router.get('/enquiries', handle('load enquiries', (req) => EnquiriesService.list(req.query)));
router.get('/enquiries/summary', handle('load the enquiry summary', () => EnquiriesService.summary()));
router.get('/enquiries/:id/repeats', handle('load the earlier messages', (req) => EnquiriesService.repeats(req.params.id)));
router.patch('/enquiries/:id', handle('update the enquiry', (req) => EnquiriesService.update(req.params.id, req.body || {}, actingAdmin(req))));

module.exports = router;
