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
    const { bookingId, amount, customerInfo } = req.body;

    console.log('Payment initiation request:', { bookingId, amount, customerInfo });

    // Validate request
    if (!bookingId || !amount) {
      return res.status(400).json({ 
        success: false,
        message: 'Missing required fields: bookingId and amount are required' 
      });
    }

    // Check if booking exists
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ 
        success: false,
        message: 'Booking not found' 
      });
    }

    // Generate order ID
    const orderId = `ORD_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    
    console.log('Generated order ID:', orderId);

    // For now, return mock payment initiation data
    const merchantId = process.env.PAYTM_MID || process.env.PAYTM_MERCHANT_ID;
    const backendUrl = process.env.BACKEND_URL || 'https://srt-backend-a5m9.onrender.com';
    
    const paymentData = {
      orderId: orderId,
      amount: amount,
      customerInfo: {
        custId: customerInfo?.email || booking.email,
        mobile: customerInfo?.phone || booking.phone,
        email: customerInfo?.email || booking.email
      },
      // In production, generate actual checksum using Paytm SDK
      txnToken: `TXN_TOKEN_${Date.now()}`,
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

    res.json({
      success: true,
      message: 'Payment initiated successfully',
      data: paymentData,
      isTestMode: process.env.PAYTM_MODE === 'test',
      note: process.env.PAYTM_MODE === 'test' ? 'Running in TEST mode. Integrate actual Paytm SDK for production.' : undefined
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

      return res.redirect(`${frontendUrl}/booking-success?token=${booking.bookingToken}`);
    } else {
      booking.status = 'cancelled';
      await booking.save();
      
      console.log('Payment failed for booking:', booking.bookingToken, 'Reason:', RESPMSG);

      return res.redirect(`${frontendUrl}/booking-failed?reason=${encodeURIComponent(RESPMSG || 'Payment failed')}`);
    }

  } catch (error) {
    console.error('Error in payment callback:', error);
    res.status(500).json({ 
      message: 'Payment callback processing failed', 
      error: error.message 
    });
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