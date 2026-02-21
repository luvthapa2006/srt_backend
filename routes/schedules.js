const express = require('express');
const router  = express.Router();
const Schedule = require('../models/Schedule');

// @route   GET /api/schedules
// @desc    Get all schedules with optional filters
router.get('/', async (req, res) => {
  try {
    const { origin, destination, date } = req.query;
    let query = {};

    if (origin)      query.origin      = new RegExp(origin, 'i');
    if (destination) query.destination = new RegExp(destination, 'i');

    if (date) {
      const searchDate = new Date(date);
      const nextDay    = new Date(searchDate);
      nextDay.setDate(nextDay.getDate() + 1);
      query.departureTime = { $gte: searchDate, $lt: nextDay };
    }

    const schedules = await Schedule.find(query).sort({ departureTime: 1 });
    res.json(schedules);
  } catch (error) {
    console.error('Error fetching schedules:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/schedules/cities
// @desc    Get all unique cities
router.get('/cities', async (req, res) => {
  try {
    const schedules = await Schedule.find({});
    const cities = new Set();
    schedules.forEach(s => { cities.add(s.origin); cities.add(s.destination); });
    res.json({ cities: Array.from(cities).sort() });
  } catch (error) {
    console.error('Error fetching cities:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/schedules/:id
// @desc    Get single schedule by ID
router.get('/:id', async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) return res.status(404).json({ message: 'Schedule not found' });
    res.json(schedule);
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/schedules
// @desc    Create new schedule (Admin only)
router.post('/', async (req, res) => {
  try {
    const {
      busName, type, origin, destination,
      pickupPoint, dropPoint,
      durationHours, durationMins,
      departureTime, arrivalTime, price
    } = req.body;

    if (!busName || !type || !origin || !destination || !departureTime || !arrivalTime || !price) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    const schedule = new Schedule({
      busName, type, origin, destination,
      pickupPoint:   pickupPoint   || '',
      dropPoint:     dropPoint     || '',
      durationHours: durationHours !== undefined ? Number(durationHours) : 0,
      durationMins:  durationMins  !== undefined ? Number(durationMins)  : 0,
      departureTime, arrivalTime, price,
      bookedSeats: []
    });

    const savedSchedule = await schedule.save();
    res.status(201).json(savedSchedule);
  } catch (error) {
    console.error('Error creating schedule:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/schedules/:id
// @desc    Update schedule (Admin only)
router.put('/:id', async (req, res) => {
  try {
    const {
      busName, type, origin, destination,
      pickupPoint, dropPoint,
      durationHours, durationMins,
      departureTime, arrivalTime, price
    } = req.body;

    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) return res.status(404).json({ message: 'Schedule not found' });

    schedule.busName       = busName       || schedule.busName;
    schedule.type          = type          || schedule.type;
    schedule.origin        = origin        || schedule.origin;
    schedule.destination   = destination   || schedule.destination;
    schedule.pickupPoint   = pickupPoint   !== undefined ? pickupPoint             : schedule.pickupPoint;
    schedule.dropPoint     = dropPoint     !== undefined ? dropPoint               : schedule.dropPoint;
    schedule.durationHours = durationHours !== undefined ? Number(durationHours)   : schedule.durationHours;
    schedule.durationMins  = durationMins  !== undefined ? Number(durationMins)    : schedule.durationMins;
    schedule.departureTime = departureTime || schedule.departureTime;
    schedule.arrivalTime   = arrivalTime   || schedule.arrivalTime;
    schedule.price         = price         || schedule.price;

    const updatedSchedule = await schedule.save();
    res.json(updatedSchedule);
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/schedules/:id
// @desc    Delete schedule (Admin only)
router.delete('/:id', async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) return res.status(404).json({ message: 'Schedule not found' });
    await Schedule.findByIdAndDelete(req.params.id);
    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;