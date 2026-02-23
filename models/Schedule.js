const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  busName: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      'AC Sleeper (36)',
      'AC Seater+Sleeper (8+32)'
    ]
  },
  origin: {
    type: String,
    required: true,
    trim: true
  },
  destination: {
    type: String,
    required: true,
    trim: true
  },

  // ── NEW: Pick up & Drop points ──
  pickupPoint: {
    type: String,
    trim: true,
    default: ''
  },
  dropPoint: {
    type: String,
    trim: true,
    default: ''
  },

  // ── NEW: Journey duration ──
  durationHours: {
    type: Number,
    default: 0,
    min: 0
  },
  durationMins: {
    type: Number,
    default: 0,
    min: 0,
    max: 59
  },

  departureTime: {
    type: Date,
    required: true
  },
  arrivalTime: {
    type: Date,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  bookedSeats: [{
    type: String,
    default: []
  }],
  totalSeats: {
    type: Number,
    default: 40
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Schedule mode: 'daterange' | 'daysofweek' | 'specific'
  scheduleMode: { type: String, default: 'specific' },
  rangeStart:   { type: String, default: '' },
  rangeEnd:     { type: String, default: '' },
  daysOfWeek:   [{ type: Number }],   // 1=Mon…7=Sun
  cancelledDates: [{ type: String }]  // ISO date strings that are cancelled e.g. ['2026-02-25']
}, {
  timestamps: true
});

scheduleSchema.index({ origin: 1, destination: 1, departureTime: 1 });

module.exports = mongoose.model('Schedule', scheduleSchema);