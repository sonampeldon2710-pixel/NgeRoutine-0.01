require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const app     = express();
const db      = require('./db');

const path = require('path');

// Serve frontend files - ONLY if they exist in the same folder
// This prevents the server from crashing if index.html isn't bundled
const frontendPath = path.join(__dirname, '..'); 
app.use(express.static(frontendPath));

app.get('/', (req, res) => {
  const indexPath = path.join(frontendPath, 'index.html');
  // Check if file exists before trying to send it
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ 
      message: "Backend is running!", 
      api_status: "ok",
      note: "Frontend files not found in container. Use your separate frontend URL." 
    });
  }
});

async function initDB() {
  await db.execute(`CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(100),
    password_hash VARCHAR(255) NOT NULL,
    last_changed TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    full_name VARCHAR(100),
    avatar_char VARCHAR(5),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS habits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    profile_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (profile_id) REFERENCES profiles(id)
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS habit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    habit_id INT NOT NULL,
    value FLOAT,
    note TEXT,
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (habit_id) REFERENCES habits(id)
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS habit_trends (
    id INT AUTO_INCREMENT PRIMARY KEY,
    habit_id INT NOT NULL,
    week_start DATE,
    avg_value FLOAT,
    FOREIGN KEY (habit_id) REFERENCES habits(id)
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    habit_id VARCHAR(100),
    habit_name VARCHAR(100),
    habit_icon VARCHAR(10),
    date DATE NOT NULL,
    duration FLOAT DEFAULT 0,
    unit VARCHAR(10) DEFAULT 'hrs',
    start_time VARCHAR(20),
    end_time VARCHAR(20),
    note TEXT,
    is_schedule TINYINT DEFAULT 0,
    is_quick_alarm TINYINT DEFAULT 0,
    schedule_id BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS schedules (
    id BIGINT PRIMARY KEY,
    user_id INT NOT NULL,
    category VARCHAR(100),
    date DATE,
    from_time VARCHAR(10),
    to_time VARCHAR(10),
    duration_mins INT DEFAULT 0,
    tasks JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS checkin_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  score INT DEFAULT 0,
  answers JSON,
  l_answers JSON,
  date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
)`);
  console.log('Database tables ready!');
}

initDB().catch(console.error);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
}));
app.options('*', cors());
app.use(express.json());

app.use('/api/auth',      require('./routes/auth'));
app.use('/api/habits',    require('./routes/habits'));
app.use('/api/logs',      require('./routes/logs'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/alarms',    require('./routes/alarms'));
app.use('/api/trends',    require('./routes/trends'));
app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.get('/debug', async (req, res) => {
  const db = require('./db');
  const [users]       = await db.execute('SELECT * FROM users');
  const [habits]      = await db.execute('SELECT * FROM habits');
  const [habit_logs]  = await db.execute('SELECT * FROM habit_logs');
  const [habit_trends]= await db.execute('SELECT * FROM habit_trends');
  const [profiles]    = await db.execute('SELECT * FROM profiles');
  res.json({ users, habits, habit_logs, habit_trends, profiles });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));