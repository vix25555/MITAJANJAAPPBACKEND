const axios = require('axios');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const STS_API_BASE_URL = process.env.STS_API_BASE_URL;
const STS_USER_IDS = (process.env.STS_USER_IDS || '').split(',').filter(id => id.trim() !== '');
const STS_USER_PASSWORD = process.env.STS_USER_PASSWORD;

if (STS_USER_IDS.length === 0 || !STS_API_BASE_URL || !STS_USER_PASSWORD) {
    console.error("FATAL ERROR: STS API environment variables (STS_API_BASE_URL, STS_USER_IDS, STS_USER_PASSWORD) are not correctly defined.");
    process.exit(1);
}

const today = () => new Date().toISOString().split('T')[0];

// Helper to get or create a user by client-generated ID
const findOrCreateUser = async (clientId) => {
    if (!clientId) return null;
    let user = await User.findOne({ clientId });
    if (!user) {
        user = new User({ clientId });
        await user.save();
    }
    return user;
};

// Main vending logic with User ID rotation
const getVendingTokenFromSTS = async (meterCode, amountOrQuantity, vendingType) => {
  let lastError = null;

  for (const userId of STS_USER_IDS) {
      try {
          const url = new URL(`${STS_API_BASE_URL}/api/Power/GetVendingToken`);
          const params = {
              UserId: userId.trim(),
              Password: STS_USER_PASSWORD,
              MeterType: '1', // 1 for electric
              MeterCode: meterCode,
              AmountOrQuantity: String(amountOrQuantity),
              VendingType: String(vendingType),
          };

          // Use axios with params for cleaner URL construction
          const response = await axios.get(url.toString(), { params });
          const result = response.data;

          if (result.Code === 0 && result.Data && result.Data.Token) {
              return result.Data.Token; // Success, return token
          } else {
              // Log non-critical API errors and try the next ID
              console.warn(`STS API attempt failed for UserId ${userId}: ${result.Message}`);
              lastError = new Error(result.Message || 'Vending failed: Invalid response from STS server.');
          }
      } catch (error) {
          const errorMessage = error.response?.data?.Message || error.message;
          console.warn(`STS API request failed for UserId ${userId}:`, errorMessage);
          lastError = new Error(errorMessage); // Store the error and continue
      }
  }

  // If all User IDs failed, throw the last recorded error
  throw lastError || new Error("All STS User IDs failed to process the vend request.");
};


exports.processVend = async (req, res) => {
    const { clientId, submeterNumber, vendData, vendType } = req.body;
    
    if (!clientId || !submeterNumber || !vendData || !vendType) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }

    try {
        const user = await findOrCreateUser(clientId);
        if (user.lastVendDate === today()) {
            return res.status(403).json({ message: 'Daily vending limit reached.' });
        }
        
        // prefer amount, but use units if amount is 0
        const vendingTypeSTS = vendData.units > 0 && vendData.amount === 0 ? 1 : 0; 
        const amountOrQuantity = vendingTypeSTS === 0 ? vendData.amount : vendData.units;
        
        if (amountOrQuantity <= 0) {
             return res.status(400).json({ message: 'Vend amount or units must be greater than zero.' });
        }

        const newToken = await getVendingTokenFromSTS(submeterNumber, amountOrQuantity, vendingTypeSTS);

        // Update user record
        if (!user.tanescoNumber && vendData.tanescoNumber && vendData.tanescoNumber !== 'N/A') {
            user.tanescoNumber = vendData.tanescoNumber;
        }
        user.lastVendDate = today();
        await user.save();
        
        // Save the transaction log
        const newTransaction = new Transaction({
            user: user._id,
            submeterNumber,
            tanescoNumber: vendData.tanescoNumber,
            tokenNumber: newToken, // The real token from STS
            transactionId: vendData.transactionId,
            amount: vendData.amount,
            units: vendData.units,
            vendType,
        });
        await newTransaction.save();
        
        // Prepare response
        const finalResult = {
            ...vendData,
            tokenNumber: newToken,
        };
        
        // If we vended by amount, the API doesn't tell us the units, so reflect that.
        if (vendingTypeSTS === 0) {
            finalResult.units = 0; // Use a consistent number type
        }

        res.status(200).json({
            message: 'Vend successful!',
            data: finalResult
        });

    } catch (error) {
        console.error("Vending process failed:", error);
        const errorMessage = error.message || 'An unexpected error occurred during vending.';
        res.status(500).json({ message: errorMessage });
    }
};

exports.getUserStatus = async (req, res) => {
    const { clientId } = req.params;
    if (!clientId) {
        return res.status(400).json({ message: "Client ID is required." });
    }
    try {
        const user = await findOrCreateUser(clientId);
        res.status(200).json({
            tanescoNumber: user.tanescoNumber,
            lastVendDate: user.lastVendDate
        });
    } catch (error) {
        console.error("Error fetching user status:", error);
        res.status(500).json({ message: "Failed to get user status." });
    }
};

exports.getLatestTransaction = async (req, res) => {
     const { clientId } = req.params;
    if (!clientId) {
        return res.status(400).json({ message: "Client ID is required." });
    }
    try {
        const user = await User.findOne({ clientId });
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        const transaction = await Transaction.findOne({ user: user._id }).sort({ createdAt: -1 });

        if (!transaction) {
            return res.status(200).json({ data: null });
        }
        
        // Reconstruct ReceiptData format for the client
        const receiptData = {
            tanescoNumber: transaction.tanescoNumber,
            tokenNumber: transaction.tokenNumber,
            transactionId: transaction.transactionId,
            amount: transaction.amount,
            units: transaction.units,
            date: transaction.createdAt.toISOString().split('T')[0],
        };

        res.status(200).json({ data: receiptData });

    } catch (error) {
        console.error("Error fetching latest transaction:", error);
        res.status(500).json({ message: "Failed to get latest transaction." });
    }
};
