const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');

// GET all coupons (admin)
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    // Auto-deactivate any coupons whose endDate has passed but are still marked active
    await Coupon.updateMany(
      { isActive: true, endDate: { $lt: now } },
      { $set: { isActive: false } }
    );
    const coupons = await Coupon.find({}).sort({ createdAt: -1 });
    res.json(coupons);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST validate/apply coupon (user-facing)
router.post('/validate', async (req, res) => {
  try {
    const { code, totalAmount } = req.body;
    if (!code) return res.status(400).json({ message: 'Coupon code required' });

    const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });
    if (!coupon) return res.status(404).json({ message: 'Invalid coupon code' });
    if (!coupon.isActive) return res.status(400).json({ message: 'This coupon is no longer active' });

    const now = new Date();
    if (now < coupon.startDate) return res.status(400).json({ message: 'Coupon is not yet valid' });
    if (now > coupon.endDate) {
      // Auto-deactivate expired coupon
      await Coupon.findByIdAndUpdate(coupon._id, { $set: { isActive: false } });
      return res.status(400).json({ message: 'Coupon has expired' });
    }
    if (coupon.maxUsage !== null && coupon.usageCount >= coupon.maxUsage) {
      return res.status(400).json({ message: 'Coupon usage limit reached' });
    }

    let discount = 0;
    if (coupon.discountType === 'flat') {
      discount = coupon.discountValue;
    } else {
      discount = Math.floor((totalAmount * coupon.discountValue) / 100);
    }
    discount = Math.min(discount, totalAmount);

    res.json({
      valid: true,
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discount,
      finalAmount: totalAmount - discount
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST create coupon (admin)
router.post('/', async (req, res) => {
  try {
    const { code, description, discountType, discountValue, startDate, endDate, maxUsage } = req.body;
    if (!code || !discountType || !discountValue || !startDate || !endDate) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }
    const existing = await Coupon.findOne({ code: code.toUpperCase().trim() });
    if (existing) return res.status(409).json({ message: 'Coupon code already exists' });

    const coupon = new Coupon({
      code: code.toUpperCase().trim(),
      description: description || '',
      discountType,
      discountValue: Number(discountValue),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      maxUsage: maxUsage ? Number(maxUsage) : null
    });
    const saved = await coupon.save();
    res.status(201).json(saved);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PUT update coupon (admin)
router.put('/:id', async (req, res) => {
  try {
    const { description, discountType, discountValue, startDate, endDate, isActive, maxUsage } = req.body;
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });

    if (description !== undefined) coupon.description = description;
    if (discountType !== undefined) coupon.discountType = discountType;
    if (discountValue !== undefined) coupon.discountValue = Number(discountValue);
    if (startDate !== undefined) coupon.startDate = new Date(startDate + 'T00:00:00.000+05:30');
    if (endDate !== undefined) coupon.endDate = new Date(endDate + 'T23:59:59.000+05:30');
    if (isActive !== undefined) coupon.isActive = isActive;
    if (maxUsage !== undefined) coupon.maxUsage = maxUsage ? Number(maxUsage) : null;

    const saved = await coupon.save();
    res.json(saved);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// DELETE coupon (admin)
router.delete('/:id', async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ message: 'Coupon deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST increment usage after successful booking
router.post('/use', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'Code required' });
    await Coupon.findOneAndUpdate(
      { code: code.toUpperCase().trim() },
      { $inc: { usageCount: 1 } }
    );
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;