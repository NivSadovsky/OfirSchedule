const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        google_id VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'student',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS session (
        sid VARCHAR NOT NULL COLLATE "default",
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL,
        CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS slots (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        start_time TIME NOT NULL,
        is_available BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(date, start_time)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        slot_id INTEGER UNIQUE NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
        user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    await client.query(`
      INSERT INTO settings (key, value) VALUES
        ('course_name', 'קביעת פגישה עם המרצה'),
        ('course_period', 'אפריל 2026')
      ON CONFLICT DO NOTHING
    `);

    await client.query('COMMIT');

    // Seed slots if empty
    const { rows } = await client.query('SELECT COUNT(*) FROM slots');
    if (parseInt(rows[0].count) === 0) {
      await seedSlots(client);
    }

    console.log('Database initialized successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error initializing database:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function seedSlots(client) {
  const days = [9, 12, 13, 14, 15, 16, 19, 23, 26, 27, 28, 29, 30];
  const hours = [11, 12, 13, 14, 15, 16, 17, 18];
  const year = 2026;
  const month = 4; // April

  const values = [];
  const params = [];
  let idx = 1;

  for (const day of days) {
    for (const hour of hours) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const timeStr = `${String(hour).padStart(2, '0')}:00:00`;
      values.push(`($${idx++}, $${idx++})`);
      params.push(dateStr, timeStr);
    }
  }

  await client.query(
    `INSERT INTO slots (date, start_time) VALUES ${values.join(', ')} ON CONFLICT DO NOTHING`,
    params
  );

  console.log(`Seeded ${days.length * hours.length} slots for April 2026`);
}

module.exports = { pool, initDB };
