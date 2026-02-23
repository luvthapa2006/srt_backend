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
// @desc    Get all unique cities (both origins and destinations combined)
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

// @route   GET /api/schedules/origins
// @desc    Get all unique origin cities
router.get('/origins', async (req, res) => {
  try {
    const schedules = await Schedule.find({});
    const origins = new Set();
    schedules.forEach(s => { origins.add(s.origin); });
    res.json({ cities: Array.from(origins).sort() });
  } catch (error) {
    console.error('Error fetching origins:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/schedules/destinations
// @desc    Get all unique destination cities
router.get('/destinations', async (req, res) => {
  try {
    const schedules = await Schedule.find({});
    const destinations = new Set();
    schedules.forEach(s => { destinations.add(s.destination); });
    res.json({ cities: Array.from(destinations).sort() });
  } catch (error) {
    console.error('Error fetching destinations:', error);
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
// @desc    Create new schedule(s) (Admin only) - supports multiple dates
router.post('/', async (req, res) => {
  try {
    const {
      busName, type, origin, destination,
      pickupPoint, dropPoint,
      durationHours, durationMins,
      departureTime, arrivalTime, price,
      busDates, busTime  // new: busDates = array of date strings, busTime = HH:mm
    } = req.body;

    if (!busName || !type || !origin || !destination || !price) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    // Multi-date support: if busDates array provided, create one schedule per date
    if (busDates && Array.isArray(busDates) && busDates.length > 0 && busTime) {
      const created = [];
      for (const dateStr of busDates) {
        const [hours, minutes] = busTime.split(':').map(Number);
        const depDate = new Date(dateStr);
        depDate.setHours(hours, minutes, 0, 0);
        
        const dh = durationHours !== undefined ? Number(durationHours) : 0;
        const dm = durationMins  !== undefined ? Number(durationMins)  : 0;
        const arrDate = new Date(depDate.getTime() + (dh * 60 + dm) * 60000);

        const schedule = new Schedule({
          busName, type, origin, destination,
          pickupPoint:   pickupPoint   || '',
          dropPoint:     dropPoint     || '',
          durationHours: dh,
          durationMins:  dm,
          departureTime: depDate,
          arrivalTime:   arrDate,
          price,
          bookedSeats: [],
          isActive: true
        });
        const saved = await schedule.save();
        created.push({ ...saved.toObject(), id: saved._id });
      }
      return res.status(201).json({ created, count: created.length });
    }

    // Single schedule (legacy)
    if (!departureTime || !arrivalTime) {
      return res.status(400).json({ message: 'Please provide departureTime and arrivalTime' });
    }

    const schedule = new Schedule({
      busName, type, origin, destination,
      pickupPoint:   pickupPoint   || '',
      dropPoint:     dropPoint     || '',
      durationHours: durationHours !== undefined ? Number(durationHours) : 0,
      durationMins:  durationMins  !== undefined ? Number(durationMins)  : 0,
      departureTime, arrivalTime, price,
      bookedSeats: [],
      isActive: true
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

// @route   PATCH /api/schedules/:id/toggle-active
// @desc    Toggle bus active/inactive status
router.patch('/:id/toggle-active', async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) return res.status(404).json({ message: 'Schedule not found' });
    schedule.isActive = !schedule.isActive;
    await schedule.save();
    res.json({ id: schedule._id, isActive: schedule.isActive });
  } catch (error) {
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