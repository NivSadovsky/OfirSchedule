const express = require('express');
const router = express.Router();
const { pool } = require('../db');

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function requireLecturer(req, res, next) {
  if (!req.user || req.user.role !== 'lecturer') return res.status(403).json({ error: 'Forbidden' });
  next();
}

// Get all slots with booking info (for lecturer)
router.get('/all', requireAuth, requireLecturer, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.*, b.id as booking_id, u.name as student_name, u.email as student_email
      FROM slots s
      LEFT JOIN bookings b ON b.slot_id = s.id
      LEFT JOIN users u ON u.id = b.user_id
      ORDER BY s.date, s.start_time
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get available slots (for students)
router.get('/available', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.*
      FROM slots s
      LEFT JOIN bookings b ON b.slot_id = s.id
      WHERE s.is_available = true AND b.id IS NULL
      ORDER BY s.date, s.start_time
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add a new slot (lecturer only)
router.post('/', requireAuth, requireLecturer, async (req, res) => {
  const { date, start_time } = req.body;
  if (!date || !start_time) return res.status(400).json({ error: 'Missing date or time' });

  try {
    const { rows } = await pool.query(
      'INSERT INTO slots (date, start_time) VALUES ($1, $2) RETURNING *',
      [date, start_time]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Slot already exists' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle slot availability (lecturer only)
router.patch('/:id/toggle', requireAuth, requireLecturer, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE slots SET is_available = NOT is_available WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Slot not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
