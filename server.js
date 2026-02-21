const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/database');

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const scheduleRoutes = require('./routes/schedules');
const bookingRoutes  = require('./routes/bookings');
const cashfreeRoutes = require('./routes/cashfree');   // ← replaces paytm

app.use('/api/schedules', scheduleRoutes);
app.use('/api/bookings',  bookingRoutes);
app.use('/api/cashfree',  cashfreeRoutes);             // ← replaces /api/paytm

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Shree Ram Travels API is running',
    paymentGateway: 'Cashfree',
    env: process.env.CASHFREE_ENV || 'TEST',
    timestamp: new Date().toISOString()
  });
});

// Root
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Shree Ram Travels Bus Booking API',
    version: '2.0.0',
    endpoints: {
      schedules: '/api/schedules',
      bookings:  '/api/bookings',
      cashfree:  '/api/cashfree',
      health:    '/api/health'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found', path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`💳 Payment gateway: Cashfree (${process.env.CASHFREE_ENV || 'TEST'} mode)`);
  console.log(`🌐 API: http://localhost:${PORT}`);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});