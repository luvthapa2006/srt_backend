const express  = require('express');
const router   = express.Router();
const axios    = require('axios');
const Booking  = require('../models/Booking');
const Schedule = require('../models/Schedule');
const { sendBookingConfirmation } = require('../utils/mailer');

// ========================================
// PHONEPE PAYMENT GATEWAY ROUTES
// PhonePe Standard Checkout V2
// ========================================

const CLIENT_ID      = process.env.PHONEPE_CLIENT_ID;
const CLIENT_SECRET  = process.env.PHONEPE_CLIENT_SECRET;
const CLIENT_VERSION = parseInt(process.env.PHONEPE_CLIENT_VERSION || '1');
const PHONEPE_ENV    = (process.env.PHONEPE_ENV || 'TEST').toUpperCase();

const BASE_URL = PHONEPE_ENV === 'PROD'
  ? 'https://api.phonepe.com/apis/hermes'
  : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

// ─────────────────────────────────────────
// Token cache
// ─────────────────────────────────────────
let cachedToken    = null;
let tokenExpiresAt = 0;

async function getAuthToken() {
  const now = Date.now() / 1000;
  if (cachedToken && tokenExpiresAt - now > 300) return cachedToken;

  const params = new URLSearchParams({
    client_id:      CLIENT_ID,
    client_secret:  CLIENT_SECRET,
    client_version: String(CLIENT_VERSION),
    grant_type:     'client_credentials'
  });

  const res = await axios.post(
    `${BASE_URL}/v1/oauth/token`,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  cachedToken    = res.data.access_token;
  tokenExpiresAt = res.data.expires_at || (now + 3600);
  console.log('✅ PhonePe token fetched, expires:', new Date(tokenExpiresAt * 1000).toISOString());
  return cachedToken;
}

// ─────────────────────────────────────────
// GET /api/phonepe/config
// ─────────────────────────────────────────
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: {
      env:  PHONEPE_ENV,
      mode: PHONEPE_ENV === 'PROD' ? 'production' : 'test'
    }
  });
});

// ─────────────────────────────────────────
// POST /api/phonepe/create-order
// 1. Validates seats are free
// 2. Creates a pending booking in DB
// 3. Initiates PhonePe payment
// 4. Returns redirect_url to frontend
// ─────────────────────────────────────────
router.post('/create-order', async (req, res) => {
  try {
    const { scheduleId, customerName, email, phone, seatNumbers, totalAmount } = req.body;

    if (!scheduleId || !customerName || !email || !phone || !seatNumbers?.length || !totalAmount) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'Schedule not found.' });
    }

    const unavailableSeats = seatNumbers.filter(s => schedule.bookedSeats.includes(s));
    if (unavailableSeats.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Some seats are no longer available.',
        unavailableSeats
      });
    }

    // Create pending booking
    const bookingToken    = `TKT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    const merchantOrderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const booking = new Booking({
      bookingToken, scheduleId, customerName, email, phone,
      seatNumbers, totalAmount,
      status: 'pending',
      paymentDetails: { orderId: merchantOrderId, paymentMethod: 'phonepe' }
    });
    await booking.save();
    console.log('✅ Pending booking created:', bookingToken);

    // Initiate PhonePe payment
    const token       = await getAuthToken();
    const frontendUrl = process.env.FRONTEND_URL || 'https://ramjibus.com';

    const ppRes = await axios.post(
      `${BASE_URL}/checkout/v2/pay`,
      {
        merchantOrderId,
        amount:      Math.round(parseFloat(totalAmount) * 100), // paise
        expireAfter: 1200,
        metaInfo: {
          udf1: bookingToken,
          udf2: customerName,
          udf3: phone
        },
        paymentFlow: {
          type:    'PG_CHECKOUT',
          message: `Bus booking – ${seatNumbers.join(', ')} – ${bookingToken}`,
          merchantUrls: {
            redirectUrl: `${frontendUrl}/payment.html?order_id=${merchantOrderId}&booking_token=${bookingToken}`
          }
        }
      },
      {
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `O-Bearer ${token}`
        }
      }
    );

    const redirectUrl = ppRes.data?.redirectUrl;
    if (!redirectUrl) {
      await Booking.deleteOne({ bookingToken });
      console.error('❌ PhonePe order creation failed:', ppRes.data);
      return res.status(502).json({
        success: false,
        message: 'Payment gateway error. Please try again.',
        detail:  ppRes.data
      });
    }

    console.log('✅ PhonePe order created:', merchantOrderId, '| redirect:', redirectUrl);

    return res.json({
      success: true,
      data: {
        orderId:      merchantOrderId,
        bookingToken,
        redirectUrl,
        amount:       totalAmount,
        env:          PHONEPE_ENV
      }
    });

  } catch (err) {
    console.error('❌ /create-order error:', err.response?.data || err.message);
    return res.status(500).json({ success: false, message: 'Server error.', error: err.message });
  }
});

// ─────────────────────────────────────────
// POST /api/phonepe/verify-payment
// Called by frontend after user returns.
// Verifies status → confirms booking →
// locks seats → sends confirmation email
// ─────────────────────────────────────────
router.post('/verify-payment', async (req, res) => {
  try {
    const { orderId, bookingToken } = req.body;

    if (!orderId || !bookingToken) {
      return res.status(400).json({ success: false, message: 'orderId and bookingToken are required.' });
    }

    const token = await getAuthToken();

    const ppRes = await axios.get(
      `${BASE_URL}/checkout/v2/order/${orderId}/status`,
      {
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `O-Bearer ${token}`
        }
      }
    );

    const orderState = ppRes.data?.state; // COMPLETED | PENDING | FAILED
    console.log(`💳 PhonePe order ${orderId} state: ${orderState}`);

    const booking = await Booking.findOne({ bookingToken }).populate('scheduleId');
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    // ── PAYMENT SUCCESSFUL ──────────────────
    if (orderState === 'COMPLETED') {

      booking.status                = 'confirmed';
      booking.paymentDetails.txnId  = ppRes.data?.paymentDetails?.[0]?.transactionId || orderId;
      booking.paymentDetails.paidAt = new Date();
      await booking.save();

      const schedule = await Schedule.findById(booking.scheduleId);
      if (schedule) {
        const newSeats = booking.seatNumbers.filter(s => !schedule.bookedSeats.includes(s));
        schedule.bookedSeats = [...schedule.bookedSeats, ...newSeats];
        await schedule.save();
        console.log(`✅ Seats locked: ${newSeats.join(', ')} on schedule ${schedule._id}`);
      }

      sendBookingConfirmation(booking, booking.scheduleId)
        .then(r  => r.success
          ? console.log(`📧 Confirmation email sent → ${booking.email}`)
          : console.warn(`⚠️  Email skipped: ${r.reason}`))
        .catch(e => console.error('❌ Mailer threw:', e.message));

      return res.json({
        success: true,
        status:  'PAID',
        booking: {
          bookingToken:  booking.bookingToken,
          customerName:  booking.customerName,
          email:         booking.email,
          phone:         booking.phone,
          seatNumbers:   booking.seatNumbers,
          totalAmount:   booking.totalAmount,
          scheduleId:    booking.scheduleId
        }
      });

    // ── PAYMENT STILL PENDING ───────────────
    } else if (orderState === 'PENDING') {
      return res.json({
        success: false,
        status:  'ACTIVE',
        message: 'Payment not completed yet.'
      });

    // ── PAYMENT FAILED / EXPIRED ────────────
    } else {
      booking.status = 'cancelled';
      await booking.save();
      console.log(`❌ Booking ${bookingToken} cancelled – order state: ${orderState}`);
      return res.json({
        success: false,
        status:  orderState || 'FAILED',
        message: `Payment ${(orderState || 'failed').toLowerCase()}.`
      });
    }

  } catch (err) {
    console.error('❌ /verify-payment error:', err.response?.data || err.message);
    return res.status(500).json({ success: false, message: 'Server error.', error: err.message });
  }
});

// ─────────────────────────────────────────
// GET /api/phonepe/status/:orderId
// Quick status check (admin / frontend poll)
// ─────────────────────────────────────────
router.get('/status/:orderId', async (req, res) => {
  try {
    const booking = await Booking.findOne({ 'paymentDetails.orderId': req.params.orderId })
      .populate('scheduleId');
    if (!booking) {
      return res.status(404).json({ success: false, message: 'No booking for this order.' });
    }
    return res.json({
      success:        true,
      orderId:        req.params.orderId,
      bookingToken:   booking.bookingToken,
      status:         booking.status,
      amount:         booking.totalAmount,
      paymentDetails: booking.paymentDetails
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.', error: err.message });
  }
});

// ─────────────────────────────────────────
// POST /api/phonepe/callback
// Server-to-server notification from PhonePe
// ─────────────────────────────────────────
router.post('/callback', (req, res) => {
  console.log('📲 PhonePe S2S callback:', JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

module.exports = router;