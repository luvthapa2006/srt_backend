const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Schedule = require('../models/Schedule');

// Helper function to generate booking token
function generateBookingToken() {
  const prefix = 'TKT';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}${random}`;
}

// ========================================
// IMPORTANT: Route Order Matters!
// Specific routes (like /stats/revenue, /reset-stats) must come BEFORE
// parameter routes (like /:token, /:bookingToken/cancel)
// ========================================

// @route   GET /api/bookings/stats/revenue
// @desc    Get booking statistics (Admin only)
// @access  Private
router.get('/stats/revenue', async (req, res) => {
  try {
    const bookings = await Booking.find({ status: 'confirmed' });
    
    const totalRevenue = bookings.reduce((sum, booking) => sum + booking.totalAmount, 0);
    const totalBookings = bookings.length;

    res.json({
      totalRevenue,
      totalBookings
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/bookings/reset-stats
// @desc    Reset all bookings and clear seats (Development/Testing only)
// @access  Private (Add authentication in production!)
router.post('/reset-stats', async (req, res) => {
  try {
    console.log('⚠️ Resetting all bookings and clearing seats...');
    
    // Delete all bookings
    const deleteResult = await Booking.deleteMany({});
    console.log(`Deleted ${deleteResult.deletedCount} bookings`);
    
    // Clear all booked seats from all schedules
    const updateResult = await Schedule.updateMany({}, { $set: { bookedSeats: [] } });
    console.log(`Cleared seats from ${updateResult.modifiedCount} schedules`);
    
    res.json({
      message: 'Stats reset successfully',
      totalRevenue: 0,
      totalBookings: 0,
      deletedBookings: deleteResult.deletedCount,
      clearedSchedules: updateResult.modifiedCount
    });
  } catch (error) {
    console.error('Error resetting stats:', error);
    res.status(500).json({ message: 'Failed to reset stats', error: error.message });
  }
});

// @route   POST /api/bookings
// @desc    Create new booking
// @access  Public
router.post('/', async (req, res) => {
  try {
    const { scheduleId, customerName, email, phone, seatNumbers, totalAmount } = req.body;

    // Validation
    if (!scheduleId || !customerName || !email || !phone || !seatNumbers || !totalAmount) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    // Check if schedule exists
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
    }

    // Check if seats are available
    const unavailableSeats = seatNumbers.filter(seat => 
      schedule.bookedSeats.includes(seat)
    );

    if (unavailableSeats.length > 0) {
      return res.status(400).json({ 
        message: 'Some seats are already booked',
        unavailableSeats 
      });
    }

    // Generate unique booking token
    const bookingToken = generateBookingToken();

    // Create booking
    const booking = new Booking({
      bookingToken,
      scheduleId,
      customerName,
      email,
      phone,
      seatNumbers,
      totalAmount,
      status: 'confirmed'
    });

    const savedBooking = await booking.save();

    // Update schedule with booked seats
    schedule.bookedSeats = [...schedule.bookedSeats, ...seatNumbers];
    await schedule.save();

    // Populate schedule details before sending response
    const populatedBooking = await Booking.findById(savedBooking._id)
      .populate('scheduleId');

    res.status(201).json(populatedBooking);
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/bookings
// @desc    Get all bookings (Admin only)
// @access  Private
router.get('/', async (req, res) => {
  try {
    const bookings = await Booking.find({})
      .populate('scheduleId')
      .sort({ createdAt: -1 });
    
    res.json(bookings);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/bookings/:bookingToken/cancel
// @desc    Cancel a booking and release seats
// @access  Public/Private
router.put('/:bookingToken/cancel', async (req, res) => {
  try {
    const { bookingToken } = req.params;
    
    console.log(`Attempting to cancel booking: ${bookingToken}`);
    
    // Find booking by token
    const booking = await Booking.findOne({ bookingToken });
    
    if (!booking) {
      console.log(`Booking not found: ${bookingToken}`);
      return res.status(404).json({ message: 'Booking not found' });
    }
    
    // Check if already cancelled
    if (booking.status === 'cancelled') {
      console.log(`Booking already cancelled: ${bookingToken}`);
      return res.status(400).json({ message: 'Booking is already cancelled' });
    }
    
    // Update booking status to cancelled
    booking.status = 'cancelled';
    await booking.save();
    console.log(`Booking status updated to cancelled: ${bookingToken}`);
    
    // Release seats from schedule
    const schedule = await Schedule.findById(booking.scheduleId);
    if (schedule) {
      // Remove booked seats from schedule
      const seatsToRelease = booking.seatNumbers;
      schedule.bookedSeats = schedule.bookedSeats.filter(
        seat => !seatsToRelease.includes(seat)
      );
      await schedule.save();
      console.log(`Released seats from schedule: ${seatsToRelease.join(', ')}`);
    } else {
      console.warn(`Schedule not found for booking: ${booking.scheduleId}`);
    }
    
    // Return populated booking
    const updatedBooking = await Booking.findById(booking._id)
      .populate('scheduleId');
    
    console.log(`✅ Booking cancelled successfully: ${bookingToken}`);
    res.json(updatedBooking);
    
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ message: 'Failed to cancel booking', error: error.message });
  }
});

// @route   GET /api/bookings/:token
// @desc    Get booking by token
// @access  Public
router.get('/:token', async (req, res) => {
  try {
    const booking = await Booking.findOne({ bookingToken: req.params.token })
      .populate('scheduleId');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    res.json(booking);
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;