const express = require('express');
const router = express.Router();
const { processVend, getUserStatus, getLatestTransaction } = require('../controllers/vendController');

// POST /api/vend
router.post('/', processVend);

// GET /api/vend/status/:clientId
router.get('/status/:clientId', getUserStatus);

// GET /api/vend/latest/:clientId
router.get('/latest/:clientId', getLatestTransaction);


module.exports = router;
