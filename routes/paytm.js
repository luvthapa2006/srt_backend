const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');

// @route   GET /api/paytm/env-check
// @desc    Check environment variables (for debugging)
// @access  Public (Remove in production!)
router.get('/env-check', (req, res) => {
  res.json({
    message: 'Environment Variables Check',
    variables: {
      PAYTM_MID: process.env.PAYTM_MID ? '✅ Set (***' + process.env.PAYTM_MID.slice(-4) + ')' : '❌ Not set',
      PAYTM_MERCHANT_ID: process.env.PAYTM_MERCHANT_ID ? '✅ Set (***' + process.env.PAYTM_MERCHANT_ID.slice(-4) + ')' : '❌ Not set',
      PAYTM_MERCHANT_KEY: process.env.PAYTM_MERCHANT_KEY ? '✅ Set (hidden)' : '❌ Not set',
      PAYTM_WEBSITE: process.env.PAYTM_WEBSITE || '❌ Not set',
      PAYTM_CALLBACK_URL: process.env.PAYTM_CALLBACK_URL || '❌ Not set',
      PAYTM_ENABLED: process.env.PAYTM_ENABLED || '❌ Not set',
      PAYTM_MODE: process.env.PAYTM_MODE || '❌ Not set',
      BACKEND_URL: process.env.BACKEND_URL || '❌ Not set',
      FRONTEND_URL: process.env.FRONTEND_URL || '❌ Not set',
      MONGODB_URI: process.env.MONGODB_URI ? '✅ Set (hidden)' : '❌ Not set',
      PORT: process.env.PORT || '❌ Not set',
      NODE_ENV: process.env.NODE_ENV || '❌ Not set'
    },
    note: 'Remove this endpoint before production!'
  });
});

// @route   GET /api/paytm/test
// @desc    Test endpoint to verify Paytm routes are working
// @access  Public
router.get('/test', (req, res) => {
  const merchantId = process.env.PAYTM_MID || process.env.PAYTM_MERCHANT_ID;
  
  res.json({
    message: 'Paytm routes are working',
    timestamp: new Date().toISOString(),
    config: {
      merchantId: merchantId ? '***' + merchantId.slice(-4) : 'Not configured',
      website: process.env.PAYTM_WEBSITE || 'WEBSTAGING',
      callbackUrl: process.env.PAYTM_CALLBACK_URL || 'Not configured',
      mode: process.env.PAYTM_MODE || 'test',
      enabled: process.env.PAYTM_ENABLED || 'Not set'
    }
  });
});

// @route   GET /api/paytm/config
// @desc    Get Paytm configuration for frontend
// @access  Public
router.get('/config', (req, res) => {
  try {
    const merchantId = process.env.PAYTM_MID || process.env.PAYTM_MERCHANT_ID;
    
    // Return Paytm configuration
    res.json({
      merchantId: merchantId,
      merchantKey: process.env.PAYTM_MERCHANT_KEY,
      websiteName: process.env.PAYTM_WEBSITE || 'WEBSTAGING',
      industryType: process.env.PAYTM_INDUSTRY_TYPE || 'Retail',
      channelId: process.env.PAYTM_CHANNEL_ID || 'WEB',
      callbackUrl: process.env.PAYTM_CALLBACK_URL || `${process.env.BACKEND_URL}/api/paytm/callback`,
      // For testing/development
      enabled: process.env.PAYTM_ENABLED === 'true' || true,
      mode: process.env.PAYTM_MODE || 'test' // 'test' or 'production'
    });
  } catch (error) {
    console.error('Error fetching Paytm config:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/paytm/initiate
// @desc    Initiate Paytm payment and create/update booking
// @access  Public
router.post('/initiate', async (req, res) => {
  try {
    console.log('=== PAYMENT INITIATE DEBUG ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    let bookingId, amount, customerInfo, booking;
    
    // Check if this is a direct booking request or payment initiation
    if (req.body.scheduleId && req.body.seatNumbers) {
      // CREATE BOOKING FIRST
      console.log('Creating booking from payment request...');
      
      booking = new Booking({
        bookingToken: `BK${Date.now()}${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
        scheduleId: req.body.scheduleId,
        customerName: req.body.customerName,
        email: req.body.email,
        phone: req.body.phone,
        seatNumbers: req.body.seatNumbers,
        totalAmount: req.body.totalAmount,
        status: 'pending'
      });
      
      await booking.save();
      console.log('Booking created:', booking._id);
      
      bookingId = booking._id.toString();
      amount = booking.totalAmount;
      customerInfo = {
        email: booking.email,
        phone: booking.phone
      };
      
    } else {
      // EXISTING BOOKING - just initiate payment
      bookingId = req.body.bookingId;
      amount = req.body.amount;
      customerInfo = req.body.customerInfo;
      
      // Validate request
      if (!bookingId || !amount) {
        return res.status(400).json({ 
          success: false,
          message: 'Missing required fields: bookingId and amount are required' 
        });
      }
      
      // Check if booking exists
      booking = await Booking.findById(bookingId);
      if (!booking) {
        return res.status(404).json({ 
          success: false,
          message: 'Booking not found' 
        });
      }
    }

    // Generate order ID
    const orderId = `ORD_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    
    console.log('Generated order ID:', orderId);

    // Get configuration
    const merchantId = process.env.PAYTM_MID || process.env.PAYTM_MERCHANT_ID;
    const backendUrl = process.env.BACKEND_URL || 'https://srt-backend-a5m9.onrender.com';
    const paytmMode = process.env.PAYTM_MODE || 'test';
    
    // Determine Paytm URL based on mode
    const paytmUrl = paytmMode === 'test' 
      ? `${backendUrl}/api/paytm/test-payment`
      : 'https://securegw.paytm.in/theia/api/v1/showPaymentPage';
    
    const paymentData = {
      orderId: orderId,
      amount: amount,
      bookingId: bookingId,
      bookingToken: booking.bookingToken,
      customerInfo: {
        custId: customerInfo?.email || booking.email,
        mobile: customerInfo?.phone || booking.phone,
        email: customerInfo?.email || booking.email
      },
      // In production, generate actual checksum using Paytm SDK
      txnToken: `TXN_TOKEN_${Date.now()}`,
      
      // CRITICAL: Add paytmUrl to response
      paytmUrl: paytmUrl,
      
      paytmParams: {
        mid: merchantId,
        orderId: orderId,
        amount: amount.toString(),
        currency: 'INR',
        callbackUrl: `${backendUrl}/api/paytm/callback`,
        website: process.env.PAYTM_WEBSITE || 'WEBSTAGING'
      }
    };

    // Update booking with payment details
    booking.paymentDetails = {
      orderId: orderId,
      paymentMethod: 'paytm'
    };
    await booking.save();
    
    console.log('Booking updated with order ID:', orderId);
    console.log('Payment URL:', paytmUrl);

    res.json({
      success: true,
      message: 'Payment initiated successfully',
      data: paymentData,
      isTestMode: paytmMode === 'test',
      note: paytmMode === 'test' ? 'Running in TEST mode. Integrate actual Paytm SDK for production.' : undefined
    });

  } catch (error) {
    console.error('Error initiating payment:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to initiate payment', 
      error: error.message 
    });
  }
});

// @route   GET /api/paytm/test-payment
// @desc    Test payment page for development
// @access  Public
router.get('/test-payment', (req, res) => {
  const { orderId, amount, mid } = req.query;
  const backendUrl = process.env.BACKEND_URL || 'https://srt-backend-a5m9.onrender.com';
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Test Payment - Shree Ram Travels</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 20px;
          padding: 40px;
          max-width: 500px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 {
          color: #333;
          margin-bottom: 10px;
          font-size: 28px;
        }
        .test-badge {
          display: inline-block;
          background: #ffd700;
          color: #333;
          padding: 5px 15px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: bold;
          margin-bottom: 30px;
        }
        .info {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 10px;
          margin-bottom: 30px;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid #e0e0e0;
        }
        .info-row:last-child { border-bottom: none; }
        .label { color: #666; font-size: 14px; }
        .value { 
          font-weight: 600; 
          color: #333;
          font-size: 16px;
        }
        .amount {
          font-size: 24px;
          color: #667eea;
        }
        .buttons {
          display: flex;
          gap: 15px;
        }
        button {
          flex: 1;
          padding: 15px;
          border: none;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        .btn-success {
          background: #10b981;
          color: white;
        }
        .btn-success:hover {
          background: #059669;
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(16, 185, 129, 0.4);
        }
        .btn-fail {
          background: #ef4444;
          color: white;
        }
        .btn-fail:hover {
          background: #dc2626;
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(239, 68, 68, 0.4);
        }
        .note {
          margin-top: 20px;
          padding: 15px;
          background: #fff3cd;
          border-left: 4px solid #ffc107;
          border-radius: 5px;
          font-size: 14px;
          color: #856404;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🧪 Test Payment</h1>
        <div class="test-badge">TESTING MODE</div>
        
        <div class="info">
          <div class="info-row">
            <span class="label">Order ID</span>
            <span class="value">${orderId || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="label">Merchant ID</span>
            <span class="value">${mid || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="label">Amount</span>
            <span class="value amount">₹${amount || 'N/A'}</span>
          </div>
        </div>

        <div class="buttons">
          <button class="btn-success" onclick="simulateSuccess()">
            ✅ Simulate Success
          </button>
          <button class="btn-fail" onclick="simulateFailure()">
            ❌ Simulate Failure
          </button>
        </div>

        <div class="note">
          <strong>⚠️ Test Mode:</strong> This is a simulated payment page. 
          Click either button to test success or failure flows.
        </div>
      </div>

      <script>
        function simulateSuccess() {
          const form = document.createElement('form');
          form.method = 'POST';
          form.action = '${backendUrl}/api/paytm/callback';
          
          const params = {
            ORDERID: '${orderId}',
            TXNID: 'TXN_' + Date.now(),
            STATUS: 'TXN_SUCCESS',
            RESPCODE: '01',
            RESPMSG: 'Txn Success'
          };
          
          Object.keys(params).forEach(key => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = params[key];
            form.appendChild(input);
          });
          
          document.body.appendChild(form);
          form.submit();
        }

        function simulateFailure() {
          const form = document.createElement('form');
          form.method = 'POST';
          form.action = '${backendUrl}/api/paytm/callback';
          
          const params = {
            ORDERID: '${orderId}',
            TXNID: 'TXN_' + Date.now(),
            STATUS: 'TXN_FAILURE',
            RESPCODE: '141',
            RESPMSG: 'Transaction failed'
          };
          
          Object.keys(params).forEach(key => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = params[key];
            form.appendChild(input);
          });
          
          document.body.appendChild(form);
          form.submit();
        }
      </script>
    </body>
    </html>
  `);
});

// @route   POST /api/paytm/callback
// @desc    Handle Paytm payment callback/response
// @access  Public
router.post('/callback', async (req, res) => {
  try {
    const { ORDERID, TXNID, STATUS, RESPCODE, RESPMSG } = req.body;

    console.log('Paytm Callback Received:', {
      ORDERID,
      TXNID,
      STATUS,
      RESPCODE,
      RESPMSG
    });

    if (!ORDERID) {
      console.error('Invalid callback: ORDERID missing');
      return res.status(400).json({ 
        message: 'Invalid callback data: ORDERID missing' 
      });
    }

    // Find booking by order ID
    const booking = await Booking.findOne({ 'paymentDetails.orderId': ORDERID });
    
    if (!booking) {
      console.error('Booking not found for order:', ORDERID);
      return res.status(404).json({ 
        message: 'Booking not found for this order' 
      });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://ramjibus.netlify.app';

    // Update booking based on payment status
    if (STATUS === 'TXN_SUCCESS' && RESPCODE === '01') {
      booking.status = 'confirmed';
      booking.paymentDetails.txnId = TXNID;
      booking.paymentDetails.paidAt = new Date();
      await booking.save();
      
      console.log('Payment successful for booking:', booking.bookingToken);

      return res.redirect(`${frontendUrl}/payment.html?status=success&orderId=${ORDERID}&txnId=${TXNID}&bookingToken=${booking.bookingToken}`);
    } else {
      booking.status = 'cancelled';
      await booking.save();
      
      console.log('Payment failed for booking:', booking.bookingToken, 'Reason:', RESPMSG);

      return res.redirect(`${frontendUrl}/payment.html?status=failed&message=${encodeURIComponent(RESPMSG || 'Payment failed')}`);
    }

  } catch (error) {
    console.error('Error in payment callback:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'https://ramjibus.netlify.app';
    return res.redirect(`${frontendUrl}/payment.html?status=error&message=${encodeURIComponent('Payment processing failed')}`);
  }
});

// @route   GET /api/paytm/status/:orderId
// @desc    Check payment status by order ID
// @access  Public
router.get('/status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    console.log('Checking payment status for order:', orderId);

    const booking = await Booking.findOne({ 'paymentDetails.orderId': orderId })
      .populate('scheduleId');

    if (!booking) {
      return res.status(404).json({ 
        success: false,
        message: 'No booking found for this order ID',
        orderId 
      });
    }

    res.json({
      success: true,
      orderId: orderId,
      bookingToken: booking.bookingToken,
      status: booking.status,
      amount: booking.totalAmount,
      paymentDetails: booking.paymentDetails,
      booking: booking
    });

  } catch (error) {
    console.error('Error checking payment status:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to check payment status', 
      error: error.message 
    });
  }
});

// @route   POST /api/paytm/verify
// @desc    Verify payment transaction
// @access  Public
router.post('/verify', async (req, res) => {
  try {
    const { orderId, txnId } = req.body;

    console.log('Verifying payment for order:', orderId);

    if (!orderId) {
      return res.status(400).json({ 
        verified: false,
        message: 'Order ID is required' 
      });
    }

    const booking = await Booking.findOne({ 'paymentDetails.orderId': orderId });

    if (!booking) {
      return res.status(404).json({ 
        verified: false,
        message: 'Booking not found' 
      });
    }

    res.json({
      verified: booking.status === 'confirmed',
      status: booking.status,
      orderId: orderId,
      txnId: booking.paymentDetails.txnId,
      amount: booking.totalAmount,
      message: booking.status === 'confirmed' ? 'Payment verified successfully' : 'Payment not completed'
    });

  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ 
      verified: false,
      message: 'Payment verification failed', 
      error: error.message 
    });
  }
});

module.exports = router;