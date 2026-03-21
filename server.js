const express = require('express');
const cors    = require('cors');
const dotenv  = require('dotenv');
const connectDB = require('./config/database');

dotenv.config();

const app = express();
connectDB();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const scheduleRoutes = require('./routes/schedules');
const bookingRoutes  = require('./routes/bookings');
const phonepeRoutes  = require('./routes/phonepe');
const couponRoutes   = require('./routes/coupons');

app.use('/api/schedules', scheduleRoutes);
app.use('/api/bookings',  bookingRoutes);
app.use('/api/phonepe',   phonepeRoutes);
app.use('/api/coupons',   couponRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status:         'OK',
    message:        'Shree Ram Travels API is running',
    paymentGateway: 'PhonePe',
    env:            process.env.PHONEPE_ENV || 'TEST',
    timestamp:      new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({
    message:  'Welcome to Shree Ram Travels Bus Booking API',
    version:  '3.0.0',
    endpoints: {
      schedules: '/api/schedules',
      bookings:  '/api/bookings',
      phonepe:   '/api/phonepe',
      health:    '/api/health'
    }
  });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found', path: req.path });
});

app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    error:   process.env.NODE_ENV === 'development' ? err : {}
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`💳 Payment gateway: PhonePe (${process.env.PHONEPE_ENV || 'TEST'} mode)`);
  console.log(`🌐 API: http://localhost:${PORT}`);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});