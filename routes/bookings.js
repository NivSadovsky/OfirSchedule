const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { sendBookingConfirmation, sendCancellationConfirmation, sendRescheduleConfirmation } = require('../email');

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function requireLecturer(req, res, next) {
  if (!req.user || req.user.role !== 'lecturer') return res.status(403).json({ error: 'Forbidden' });
  next();
}

// Get current user's booking
router.get('/my', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*, s.date, s.start_time, s.is_available
       FROM bookings b
       JOIN slots s ON s.id = b.slot_id
       WHERE b.user_id = $1`,
      [req.user.id]
    );
    res.json(rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all bookings (lecturer only)
router.get('/all', requireAuth, requireLecturer, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*, s.date, s.start_time, u.name as student_name, u.email as student_email
       FROM bookings b
       JOIN slots s ON s.id = b.slot_id
       JOIN users u ON u.id = b.user_id
       ORDER BY s.date, s.start_time`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a booking
router.post('/', requireAuth, async (req, res) => {
  if (req.user.role === 'lecturer') return res.status(403).json({ error: 'Lecturers cannot book slots' });

  const { slot_id } = req.body;
  if (!slot_id) return res.status(400).json({ error: 'Missing slot_id' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check student has no existing booking
    const existing = await client.query('SELECT * FROM bookings WHERE user_id = $1', [req.user.id]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Already have a booking' });
    }

    // Check slot is available and not booked
    const slotRes = await client.query(
      'SELECT * FROM slots WHERE id = $1 AND is_available = true FOR UPDATE',
      [slot_id]
    );
    if (!slotRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Slot not available' });
    }

    const slotBooked = await client.query('SELECT * FROM bookings WHERE slot_id = $1', [slot_id]);
    if (slotBooked.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Slot already booked' });
    }

    const { rows } = await client.query(
      'INSERT INTO bookings (slot_id, user_id) VALUES ($1, $2) RETURNING *',
      [slot_id, req.user.id]
    );

    await client.query('COMMIT');

    // Send emails (non-blocking)
    sendBookingConfirmation({ student: req.user, slot: slotRes.rows[0] }).catch(console.error);

    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Slot already booked' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Cancel a booking
router.delete('/my', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bookingRes = await client.query(
      `SELECT b.*, s.date, s.start_time FROM bookings b
       JOIN slots s ON s.id = b.slot_id
       WHERE b.user_id = $1`,
      [req.user.id]
    );

    if (!bookingRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No booking found' });
    }

    const booking = bookingRes.rows[0];
    await client.query('DELETE FROM bookings WHERE id = $1', [booking.id]);
    await client.query('COMMIT');

    sendCancellationConfirmation({ student: req.user, slot: booking }).catch(console.error);

    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Reschedule (cancel + rebook in one transaction)
router.post('/reschedule', requireAuth, async (req, res) => {
  if (req.user.role === 'lecturer') return res.status(403).json({ error: 'Forbidden' });

  const { new_slot_id } = req.body;
  if (!new_slot_id) return res.status(400).json({ error: 'Missing new_slot_id' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get current booking
    const currentRes = await client.query(
      `SELECT b.*, s.date, s.start_time FROM bookings b
       JOIN slots s ON s.id = b.slot_id
       WHERE b.user_id = $1`,
      [req.user.id]
    );

    if (!currentRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No existing booking' });
    }

    const oldBooking = currentRes.rows[0];

    // Check new slot is available and not booked
    const newSlotRes = await client.query(
      'SELECT * FROM slots WHERE id = $1 AND is_available = true FOR UPDATE',
      [new_slot_id]
    );
    if (!newSlotRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'New slot not available' });
    }

    const newSlotBooked = await client.query('SELECT * FROM bookings WHERE slot_id = $1', [new_slot_id]);
    if (newSlotBooked.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'New slot already booked' });
    }

    // Delete old, create new
    await client.query('DELETE FROM bookings WHERE id = $1', [oldBooking.id]);
    const { rows } = await client.query(
      'INSERT INTO bookings (slot_id, user_id) VALUES ($1, $2) RETURNING *',
      [new_slot_id, req.user.id]
    );

    await client.query('COMMIT');

    sendRescheduleConfirmation({ student: req.user, oldSlot: oldBooking, newSlot: newSlotRes.rows[0] }).catch(console.error);

    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
