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
      'AC Sleeper (2+1)',
      'AC Sleeper (1+1)',
      'Non-AC Sleeper (2+1)',
      'AC Seater (2+2)',
      'AC Seater (2+1)',
      'Non-AC Seater (2+2)'
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
  }
}, {
  timestamps: true
});

// Add index for faster queries
scheduleSchema.index({ origin: 1, destination: 1, departureTime: 1 });

module.exports = mongoose.model('Schedule', scheduleSchema);