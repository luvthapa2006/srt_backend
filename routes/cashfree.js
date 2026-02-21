const express = require('express');
const router = express.Router();
const https = require('https');
const Booking = require('../models/Booking');
const Schedule = require('../models/Schedule');

// ========================================
// CASHFREE PAYMENT GATEWAY ROUTES
// Cashfree Orders API v2022-09-01
// ========================================

const CASHFREE_APP_ID  = process.env.CASHFREE_APP_ID;
const CASHFREE_SECRET  = process.env.CASHFREE_SECRET_KEY;
const CASHFREE_ENV     = (process.env.CASHFREE_ENV || 'TEST').toUpperCase();

// Base URL switches automatically between sandbox and production
const CF_BASE_URL = CASHFREE_ENV === 'PROD'
  ? 'https://api.cashfree.com'
  : 'https://sandbox.cashfree.com';

// ----------------------------------------
// Helper – call Cashfree REST API
// ----------------------------------------
function cashfreeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: CF_BASE_URL.replace('https://', ''),
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': CASHFREE_APP_ID,
        'x-client-secret': CASHFREE_SECRET,
        'x-api-version': '2022-09-01',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ----------------------------------------
// GET /api/cashfree/config
// Returns safe config info for frontend
// ----------------------------------------
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: {
      appId: CASHFREE_APP_ID,
      env: CASHFREE_ENV,
      mode: CASHFREE_ENV === 'PROD' ? 'production' : 'test'
    }
  });
});

// ----------------------------------------
// POST /api/cashfree/create-order
// 1. Validates seats are still free
// 2. Creates a pending booking in DB
// 3. Creates a Cashfree order
// 4. Returns order token to frontend
// ----------------------------------------
router.post('/create-order', async (req, res) => {
  try {
    const {
      scheduleId,
      customerName,
      email,
      phone,
      seatNumbers,
      totalAmount
    } = req.body;

    // --- basic validation ---
    if (!scheduleId || !customerName || !email || !phone || !seatNumbers?.length || !totalAmount) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    // --- check schedule exists ---
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Schedule not found.' });
    }

    // --- check seat availability ---
    const unavailableSeats = seatNumbers.filter(s => schedule.bookedSeats.includes(s));
    if (unavailableSeats.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Some seats are no longer available.',
        unavailableSeats
      });
    }

    // --- create pending booking ---
    const bookingToken = `TKT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2,5).toUpperCase()}`;
    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const booking = new Booking({
      bookingToken,
      scheduleId,
      customerName,
      email,
      phone,
      seatNumbers,
      totalAmount,
      status: 'pending',
      paymentDetails: {
        orderId,
        paymentMethod: 'cashfree'
      }
    });

    await booking.save();
    console.log('✅ Pending booking created:', bookingToken);

    // --- create Cashfree order ---
    const frontendUrl = process.env.FRONTEND_URL || 'https://ramjibus.netlify.app';

    const cfOrderPayload = {
      order_id: orderId,
      order_amount: parseFloat(totalAmount),
      order_currency: 'INR',
      customer_details: {
        customer_id: `CUST-${Date.now()}`,
        customer_name: customerName,
        customer_email: email,
        customer_phone: phone
      },
      order_meta: {
        return_url: `${frontendUrl}/payment.html?order_id={order_id}&booking_token=${bookingToken}`
      },
      order_note: `Bus booking – ${seatNumbers.join(', ')} – ${bookingToken}`
    };

    const cfRes = await cashfreeRequest('POST', '/pg/orders', cfOrderPayload);

    if (cfRes.status !== 200) {
      // Roll back the pending booking
      await Booking.deleteOne({ bookingToken });
      console.error('❌ Cashfree order creation failed:', cfRes.body);
      return res.status(502).json({
        success: false,
        message: 'Payment gateway error. Please try again.',
        detail: cfRes.body
      });
    }

    const { payment_session_id } = cfRes.body;
    console.log('✅ Cashfree order created:', orderId, '| session:', payment_session_id);

    return res.json({
      success: true,
      data: {
        orderId,
        bookingToken,
        paymentSessionId: payment_session_id,
        amount: totalAmount,
        env: CASHFREE_ENV
      }
    });

  } catch (err) {
    console.error('❌ /create-order error:', err);
    return res.status(500).json({ success: false, message: 'Server error.', error: err.message });
  }
});

// ----------------------------------------
// POST /api/cashfree/verify-payment
// Called by frontend after user returns
// Verifies payment status with Cashfree
// Confirms (or cancels) booking accordingly
// ----------------------------------------
router.post('/verify-payment', async (req, res) => {
  try {
    const { orderId, bookingToken } = req.body;

    if (!orderId || !bookingToken) {
      return res.status(400).json({ success: false, message: 'orderId and bookingToken are required.' });
    }

    // Fetch order status from Cashfree
    const cfRes = await cashfreeRequest('GET', `/pg/orders/${orderId}`);

    if (cfRes.status !== 200) {
      console.error('❌ Cashfree order fetch failed:', cfRes.body);
      return res.status(502).json({ success: false, message: 'Could not verify payment. Try again.' });
    }

    const orderStatus = cfRes.body.order_status; // PAID | ACTIVE | EXPIRED | CANCELLED
    console.log(`💳 Cashfree order ${orderId} status: ${orderStatus}`);

    // Find booking
    const booking = await Booking.findOne({ bookingToken }).populate('scheduleId');
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    if (orderStatus === 'PAID') {
      // --- confirm booking & lock seats ---
      booking.status = 'confirmed';
      booking.paymentDetails.txnId = cfRes.body.cf_order_id?.toString() || orderId;
      booking.paymentDetails.paidAt = new Date();
      await booking.save();

      // Lock seats on the schedule
      const schedule = await Schedule.findById(booking.scheduleId);
      if (schedule) {
        const newSeats = booking.seatNumbers.filter(s => !schedule.bookedSeats.includes(s));
        schedule.bookedSeats = [...schedule.bookedSeats, ...newSeats];
        await schedule.save();
        console.log(`✅ Seats locked: ${newSeats.join(', ')} on schedule ${schedule._id}`);
      }

      return res.json({
        success: true,
        status: 'PAID',
        booking: {
          bookingToken: booking.bookingToken,
          customerName: booking.customerName,
          email: booking.email,
          phone: booking.phone,
          seatNumbers: booking.seatNumbers,
          totalAmount: booking.totalAmount,
          scheduleId: booking.scheduleId
        }
      });

    } else if (orderStatus === 'ACTIVE') {
      // Payment page still open / user hasn't paid yet
      return res.json({ success: false, status: 'ACTIVE', message: 'Payment not completed yet.' });

    } else {
      // EXPIRED / CANCELLED / FAILED
      booking.status = 'cancelled';
      await booking.save();
      console.log(`❌ Booking ${bookingToken} cancelled – order status: ${orderStatus}`);
      return res.json({ success: false, status: orderStatus, message: `Payment ${orderStatus.toLowerCase()}.` });
    }

  } catch (err) {
    console.error('❌ /verify-payment error:', err);
    return res.status(500).json({ success: false, message: 'Server error.', error: err.message });
  }
});

// ----------------------------------------
// GET /api/cashfree/status/:orderId
// Quick status check by orderId
// ----------------------------------------
router.get('/status/:orderId', async (req, res) => {
  try {
    const booking = await Booking.findOne({ 'paymentDetails.orderId': req.params.orderId })
      .populate('scheduleId');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'No booking for this order.' });
    }

    return res.json({
      success: true,
      orderId: req.params.orderId,
      bookingToken: booking.bookingToken,
      status: booking.status,
      amount: booking.totalAmount,
      paymentDetails: booking.paymentDetails
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.', error: err.message });
  }
});

module.exports = router;