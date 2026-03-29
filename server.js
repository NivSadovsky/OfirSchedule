require('dotenv').config();
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const passport = require('./auth');
const { pool, initDB } = require('./db');
const slotsRouter = require('./routes/slots');
const bookingsRouter = require('./routes/bookings');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
  store: new PgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: false,
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
  },
}));

app.use(passport.initialize());
app.use(passport.session());

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Auth routes
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/?error=auth' }),
  (req, res) => {
    if (req.user.role === 'lecturer') {
      res.redirect('/lecturer.html');
    } else {
      res.redirect('/index.html');
    }
  }
);

app.get('/auth/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => res.redirect('/'));
  });
});

// Current user API
app.get('/api/me', (req, res) => {
  if (!req.user) return res.json(null);
  res.json({ id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role });
});

// API routes
app.use('/api/slots', slotsRouter);
app.use('/api/bookings', bookingsRouter);

// Serve main page for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Start server
async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
