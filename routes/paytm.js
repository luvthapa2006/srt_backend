const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');

// @route   GET /api/paytm/config
// @desc    Get Paytm configuration for frontend
// @access  Public
router.get('/config', (req, res) => {
  try {
    // Return Paytm configuration
    res.json({
      merchantId: process.env.PAYTM_MID || process.env.PAYTM_MERCHANT_ID,
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

    // In a real implementation, you would:
    // 1. Generate checksum using Paytm's SDK
    // 2. Create payment request parameters
    // 3. Store order details in database

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
      // Flag to indicate this is a test/mock response
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

    // In production:
    // 1. Verify checksum
    // 2. Validate transaction with Paytm server
    // 3. Update booking status

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

      // Redirect to success page
      return res.redirect(`${frontendUrl}/booking-success?token=${booking.bookingToken}`);
    } else {
      booking.status = 'cancelled';
      await booking.save();
      
      console.log('Payment failed for booking:', booking.bookingToken, 'Reason:', RESPMSG);

      // Redirect to failure page
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

    // Find booking by order ID
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
// @desc    Verify payment transaction with Paytm server
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

    // In production, verify with Paytm's transaction status API
    // For now, check database
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

// @route   GET /api/paytm/test
// @desc    Test endpoint to verify Paytm routes are working
// @access  Public
router.get('/test', (req, res) => {
  res.json({
    message: 'Paytm routes are working',
    timestamp: new Date().toISOString(),
    config: {
      merchantId: process.env.PAYTM_MID ? '***' + process.env.PAYTM_MID.slice(-4) : 'Not configured',
      website: process.env.PAYTM_WEBSITE || 'Not configured',
      callbackUrl: process.env.PAYTM_CALLBACK_URL || 'Not configured',
      mode: process.env.PAYTM_MODE || 'test'
    }
  });
});

module.exports = router;