require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const app     = express();
const db      = require('./db');
const path    = require('path');

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
}));
app.options('*', cors());
app.use(express.json());

// Serve frontend files
app.use(express.static(path.join(__dirname, '..')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

// ── Create all tables on startup ──────────────────
async function initDB() {
  // Users
  await db.execute(`CREATE TABLE IF NOT EXISTS users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(50)  UNIQUE NOT NULL,
    full_name     VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_changed  TIMESTAMP NULL
  )`);

  // Habit logs — full schema matching spttool.js
  await db.execute(`CREATE TABLE IF NOT EXISTS logs (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    user_id        INT NOT NULL,
    habit_id       VARCHAR(50),
    habit_name     VARCHAR(100),
    habit_icon     VARCHAR(10),
    date           DATE NOT NULL,
    duration       DECIMAL(8,4) DEFAULT 0,
    unit           VARCHAR(10)  DEFAULT 'hrs',
    start_time     VARCHAR(20),
    end_time       VARCHAR(20),
    note           TEXT,
    is_schedule    TINYINT(1)   DEFAULT 0,
    is_quick_alarm TINYINT(1)   DEFAULT 0,
    schedule_id    INT          NULL,
    created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  // Habit alarms
  await db.execute(`CREATE TABLE IF NOT EXISTS alarms (
    id        INT AUTO_INCREMENT PRIMARY KEY,
    user_id   INT NOT NULL,
    habit_id  VARCHAR(50) NOT NULL,
    from_time VARCHAR(10),
    to_time   VARCHAR(10),
    active    TINYINT(1) DEFAULT 1,
    sound     VARCHAR(50) DEFAULT 'bell',
    UNIQUE KEY uq_user_habit (user_id, habit_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  // Quick alarms
  await db.execute(`CREATE TABLE IF NOT EXISTS quick_alarms (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT NOT NULL,
    date          DATE NOT NULL,
    from_time     VARCHAR(10),
    to_time       VARCHAR(10),
    from_display  VARCHAR(20),
    to_display    VARCHAR(20),
    duration      VARCHAR(20),
    duration_mins INT  DEFAULT 0,
    duration_hrs  DECIMAL(6,2) DEFAULT 0,
    category      VARCHAR(100),
    sound         VARCHAR(50) DEFAULT 'bell',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  // Schedules
  await db.execute(`CREATE TABLE IF NOT EXISTS schedules (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT NOT NULL,
    category      VARCHAR(100),
    date          DATE NOT NULL,
    from_time     VARCHAR(10),
    to_time       VARCHAR(10),
    duration_mins INT DEFAULT 0,
    tasks         JSON,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  // Check-in history
  await db.execute(`CREATE TABLE IF NOT EXISTS checkin_history (
    id        INT AUTO_INCREMENT PRIMARY KEY,
    user_id   INT NOT NULL,
    date      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    score     INT DEFAULT 0,
    answers   JSON,
    l_answers JSON,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  console.log('All tables ready!');
}

initDB().catch(console.error);

// ── Routes ────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/logs',      require('./routes/logs'));
app.use('/api/alarms',    require('./routes/alarms'));
app.use('/api/schedules', require('./routes/schedules'));

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// Debug — shows all data (remove in production)
app.get('/debug', async (req, res) => {
  try {
    const [users]    = await db.execute('SELECT id, username, full_name, created_at FROM users');
    const [logs]     = await db.execute('SELECT * FROM logs LIMIT 20');
    const [alarms]   = await db.execute('SELECT * FROM alarms');
    const [schedules]= await db.execute('SELECT * FROM schedules');
    res.json({ users, logs, alarms, schedules });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));