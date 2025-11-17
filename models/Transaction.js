const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    submeterNumber: {
        type: String,
        required: true,
    },
    tanescoNumber: {
        type: String,
        required: true,
    },
    tokenNumber: {
        type: String,
        required: true,
    },
    transactionId: {
        type: String,
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    units: {
        type: Number,
        required: true,
    },
    vendType: {
        type: String,
        enum: ['upload', 'manual'],
        required: true,
    },
}, { timestamps: true });

module.exports = mongoose.model('Transaction', TransactionSchema);
