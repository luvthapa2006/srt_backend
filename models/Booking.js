const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  bookingToken: {
    type: String,
    required: true,
    unique: true
  },
  scheduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Schedule',
    required: true
  },
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  seatNumbers: [{
    type: String,
    required: true
  }],
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
    default: 'pending'
  },
  paymentDetails: {
    orderId: String,
    txnId: String,
    paymentMethod: String,
    paidAt: Date
  }
}, {
  timestamps: true
});

// Add indexes
bookingSchema.index({ scheduleId: 1 });
bookingSchema.index({ email: 1 });

module.exports = mongoose.model('Booking', bookingSchema);