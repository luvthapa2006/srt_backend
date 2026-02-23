const express = require('express');
const router  = express.Router();
const Schedule = require('../models/Schedule');

// ── Helper: given a schedule, return the "effective" departure/arrival
//    for display purposes, respecting the isActive (daily recurring) flag.
//
//  Logic:
//    1. If departure is in the future → show as-is (regardless of isActive).
//    2. If departure has already passed AND isActive === true (daily recurring):
//         → roll forward day by day until departure is in the future.
//         → return a virtual schedule object with updated times (NOT saved to DB).
//    3. If departure has already passed AND isActive === false (one-time / disabled):
//         → return null (exclude from results).
// ──────────────────────────────────────────────────────────────────────────────
function resolveSchedule(schedule) {
  const now = new Date();
  const dep = new Date(schedule.departureTime);
  const cancelled = schedule.cancelledDates || [];

  // Helper: check if a date string is cancelled
  function isCancelledDate(d) {
    const ds = d.toISOString().split('T')[0];
    return cancelled.includes(ds);
  }

  // For daterange / daysofweek schedules, generate the NEXT valid upcoming departure
  if (schedule.scheduleMode === 'daterange' || schedule.scheduleMode === 'daysofweek') {
    const arr    = new Date(schedule.arrivalTime);
    const tripMs = arr - dep;
    const depHours = dep.getHours(), depMins = dep.getMinutes();

    // Scan forward from today to find next valid, non-cancelled occurrence
    let candidate = new Date(now);
    candidate.setHours(depHours, depMins, 0, 0);
    if (candidate <= now) candidate.setDate(candidate.getDate() + 1); // start tomorrow if today's time passed

    const rangeEnd = schedule.rangeEnd ? new Date(schedule.rangeEnd + 'T23:59:59') : new Date(now.getTime() + 365 * 86400000);

    for (let i = 0; i < 60; i++) {
      const ds = candidate.toISOString().split('T')[0];
      if (candidate > rangeEnd) return null; // past end of range

      let valid = false;
      if (schedule.scheduleMode === 'daterange') {
        const rangeStart = schedule.rangeStart ? new Date(schedule.rangeStart) : dep;
        valid = candidate >= rangeStart;
      } else if (schedule.scheduleMode === 'daysofweek') {
        const dow = candidate.getDay() || 7;
        valid = (schedule.daysOfWeek || []).includes(dow);
      }

      if (valid && !cancelled.includes(ds)) {
        const newDep = new Date(candidate);
        const newArr = new Date(newDep.getTime() + tripMs);
        const obj = schedule.toObject ? schedule.toObject() : { ...schedule };
        return { ...obj, id: obj._id || obj.id, departureTime: newDep, arrivalTime: newArr, bookedSeats: [], _isRecurring: true };
      }
      candidate.setDate(candidate.getDate() + 1);
    }
    return null;
  }

  // Legacy / specific-dates schedule
  if (dep > now) {
    if (isCancelledDate(dep)) return null;
    return schedule;
  }

  // Past and recurring (isActive = true) → roll forward
  if (schedule.isActive) {
    const arr     = new Date(schedule.arrivalTime);
    const tripMs  = arr - dep;
    const diffMs  = now - dep;
    const daysBack = Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;

    let newDep = new Date(dep.getTime() + daysBack * 24 * 60 * 60 * 1000);
    let newArr = new Date(newDep.getTime() + tripMs);

    // Skip cancelled dates
    for (let i = 0; i < 30; i++) {
      const ds = newDep.toISOString().split('T')[0];
      if (!cancelled.includes(ds)) break;
      newDep.setDate(newDep.getDate() + 1);
      newArr = new Date(newDep.getTime() + tripMs);
    }

    const obj = schedule.toObject ? schedule.toObject() : { ...schedule };
    return { ...obj, id: obj._id || obj.id, departureTime: newDep, arrivalTime: newArr, bookedSeats: [], _isRecurring: true };
  }

  return null;
}

// @route   GET /api/schedules
// @desc    Get all schedules with optional filters
router.get('/', async (req, res) => {
  try {
    const { origin, destination, date } = req.query;
    let query = {};

    if (origin)      query.origin      = new RegExp(origin, 'i');
    if (destination) query.destination = new RegExp(destination, 'i');

    // When a specific date is requested:
    //   - fetch schedules for that date (fixed-date ones)
    //   - ALSO fetch ALL isActive=true schedules (recurring) regardless of date,
    //     then resolve them — their effective date might be the searched date
    let schedules;
    if (date) {
      const searchDate = new Date(date);
      const nextDay    = new Date(searchDate);
      nextDay.setDate(nextDay.getDate() + 1);

      // Fixed schedules on this date
      const fixedQuery = { ...query, departureTime: { $gte: searchDate, $lt: nextDay } };
      const fixedSchedules = await Schedule.find(fixedQuery).sort({ departureTime: 1 });

      // Recurring schedules (isActive=true) — could land on searched date after rolling
      const recurringQuery = { ...query, isActive: true };
      const recurringSchedules = await Schedule.find(recurringQuery).sort({ departureTime: 1 });

      // Resolve recurring → check if their rolled date matches the searched date
      const resolvedRecurring = recurringSchedules
        .map(resolveSchedule)
        .filter(s => {
          if (!s || !s._isRecurring) return false;
          const d = new Date(s.departureTime);
          return d >= searchDate && d < nextDay;
        });

      // Merge, deduplicate by id
      const seen = new Set();
      schedules = [];
      for (const s of [...fixedSchedules, ...resolvedRecurring]) {
        const id = String(s._id || s.id);
        if (!seen.has(id)) { seen.add(id); schedules.push(s); }
      }
      schedules.sort((a, b) => new Date(a.departureTime) - new Date(b.departureTime));

    } else {
      // No date filter — get all, resolve each
      const raw = await Schedule.find(query).sort({ departureTime: 1 });
      schedules = raw.map(resolveSchedule).filter(Boolean);
    }

    res.json(schedules);
  } catch (error) {
    console.error('Error fetching schedules:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/schedules/cities
router.get('/cities', async (req, res) => {
  try {
    const schedules = await Schedule.find({});
    const cities = new Set();
    schedules.forEach(s => { cities.add(s.origin); cities.add(s.destination); });
    res.json({ cities: Array.from(cities).sort() });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/schedules/origins
router.get('/origins', async (req, res) => {
  try {
    const schedules = await Schedule.find({});
    const origins = new Set();
    schedules.forEach(s => { origins.add(s.origin); });
    res.json({ cities: Array.from(origins).sort() });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/schedules/destinations
router.get('/destinations', async (req, res) => {
  try {
    const schedules = await Schedule.find({});
    const destinations = new Set();
    schedules.forEach(s => { destinations.add(s.destination); });
    res.json({ cities: Array.from(destinations).sort() });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/schedules/:id
router.get('/:id', async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) return res.status(404).json({ message: 'Schedule not found' });
    res.json(schedule);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   POST /api/schedules
router.post('/', async (req, res) => {
  try {
    const {
      busName, type, origin, destination,
      pickupPoint, dropPoint,
      durationHours, durationMins,
      departureTime, arrivalTime, price,
      busDates, busTime
    } = req.body;

    if (!busName || !type || !origin || !destination || !price) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    // Multi-date support
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
          pickupPoint: pickupPoint || '',
          dropPoint:   dropPoint   || '',
          durationHours: dh, durationMins: dm,
          departureTime: depDate,
          arrivalTime:   arrDate,
          price, bookedSeats: [], isActive: true,
          scheduleMode: scheduleMode || 'specific',
          rangeStart:   rangeStart   || '',
          rangeEnd:     rangeEnd     || '',
          daysOfWeek:   daysOfWeek   || []
        });
        const saved = await schedule.save();
        created.push({ ...saved.toObject(), id: saved._id });
      }
      return res.status(201).json({ created, count: created.length });
    }

    // Single schedule
    if (!departureTime || !arrivalTime) {
      return res.status(400).json({ message: 'Please provide departureTime and arrivalTime' });
    }

    const schedule = new Schedule({
      busName, type, origin, destination,
      pickupPoint: pickupPoint || '',
      dropPoint:   dropPoint   || '',
      durationHours: durationHours !== undefined ? Number(durationHours) : 0,
      durationMins:  durationMins  !== undefined ? Number(durationMins)  : 0,
      departureTime, arrivalTime, price,
      bookedSeats: [], isActive: true
    });

    const savedSchedule = await schedule.save();
    res.status(201).json(savedSchedule);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/schedules/:id
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
    schedule.pickupPoint   = pickupPoint   !== undefined ? pickupPoint           : schedule.pickupPoint;
    schedule.dropPoint     = dropPoint     !== undefined ? dropPoint             : schedule.dropPoint;
    schedule.durationHours = durationHours !== undefined ? Number(durationHours) : schedule.durationHours;
    schedule.durationMins  = durationMins  !== undefined ? Number(durationMins)  : schedule.durationMins;
    schedule.departureTime = departureTime || schedule.departureTime;
    schedule.arrivalTime   = arrivalTime   || schedule.arrivalTime;
    schedule.price         = price         || schedule.price;

    const updatedSchedule = await schedule.save();
    res.json(updatedSchedule);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PATCH /api/schedules/:id/toggle-active
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

// @route   PATCH /api/schedules/:id/cancel-dates
// @desc    Cancel specific dates on a recurring route (add to cancelledDates array)
router.patch('/:id/cancel-dates', async (req, res) => {
  try {
    const { dates } = req.body;  // array of 'YYYY-MM-DD' strings
    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ message: 'Provide an array of dates to cancel' });
    }
    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) return res.status(404).json({ message: 'Schedule not found' });
    // Merge with existing cancelled dates, deduplicate
    const existing = schedule.cancelledDates || [];
    schedule.cancelledDates = [...new Set([...existing, ...dates])];
    await schedule.save();
    res.json({ id: schedule._id, cancelledDates: schedule.cancelledDates });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/schedules/:id
router.delete('/:id', async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) return res.status(404).json({ message: 'Schedule not found' });
    await Schedule.findByIdAndDelete(req.params.id);
    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;