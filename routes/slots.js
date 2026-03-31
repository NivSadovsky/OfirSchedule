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

// Get course settings (public - needed for login page too)
router.get('/settings', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings');
    const s = {};
    for (const r of rows) s[r.key] = r.value;
    res.json({
      course_name: s.course_name || 'קביעת פגישה עם המרצה',
      course_period: s.course_period || '',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Setup new course — generates slots (lecturer only)
router.post('/setup', requireAuth, requireLecturer, async (req, res) => {
  const { course_name, start_date, end_date, days_of_week, start_hour, end_hour } = req.body;
  if (!course_name || !start_date || !end_date || !days_of_week || start_hour == null || end_hour == null) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM bookings');
    await client.query('DELETE FROM slots');
    await client.query('ALTER SEQUENCE slots_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE bookings_id_seq RESTART WITH 1');

    // Build period label
    const startD = new Date(start_date + 'T12:00:00');
    const endD = new Date(end_date + 'T12:00:00');
    const MONTHS_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
    const periodLabel = startD.getMonth() === endD.getMonth()
      ? `${MONTHS_HE[startD.getMonth()]} ${startD.getFullYear()}`
      : `${MONTHS_HE[startD.getMonth()]}–${MONTHS_HE[endD.getMonth()]} ${endD.getFullYear()}`;

    await client.query(`UPDATE settings SET value = $1 WHERE key = 'course_name'`, [course_name]);
    await client.query(`UPDATE settings SET value = $1 WHERE key = 'course_period'`, [periodLabel]);

    // Generate slots
    const values = [];
    const params = [];
    let idx = 1;
    const cur = new Date(start_date + 'T12:00:00');
    const last = new Date(end_date + 'T12:00:00');
    while (cur <= last) {
      if (days_of_week.includes(cur.getDay())) {
        for (let h = parseInt(start_hour); h <= parseInt(end_hour); h++) {
          const dateStr = cur.toISOString().substring(0, 10);
          const timeStr = `${String(h).padStart(2, '0')}:00:00`;
          values.push(`($${idx++}, $${idx++})`);
          params.push(dateStr, timeStr);
        }
      }
      cur.setDate(cur.getDate() + 1);
    }

    if (values.length) {
      await client.query(
        `INSERT INTO slots (date, start_time) VALUES ${values.join(', ')} ON CONFLICT DO NOTHING`,
        params
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, slots_created: values.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Reset all bookings and slots (lecturer only)
router.delete('/reset', requireAuth, requireLecturer, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM bookings');
    await client.query('DELETE FROM slots');
    await client.query('ALTER SEQUENCE slots_id_seq RESTART WITH 1');
    await client.query('ALTER SEQUENCE bookings_id_seq RESTART WITH 1');
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

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
