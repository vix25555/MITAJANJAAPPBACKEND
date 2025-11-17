const express = require('express');
const router = express.Router();
const { processVend, getUserStatus, getLatestTransaction } = require('../controllers/vendController');

// @route   POST api/vend
// @desc    Process a new vend request (either from upload or manual)
// @access  Public
router.post('/', processVend);

// @route   GET api/vend/status/:clientId
// @desc    Get the status of a user (tanesco number, last vend date)
// @access  Public
router.get('/status/:clientId', getUserStatus);

// @route   GET api/vend/latest/:clientId
// @desc    Get the latest successful transaction for a user
// @access  Public
router.get('/latest/:clientId', getLatestTransaction);

module.exports = router;
