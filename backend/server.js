require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const app     = express();
const db      = require('./db');

async function initDB() {
  await db.execute(`CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
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

app.use('/api/auth',   require('./routes/auth'));
app.use('/api/habits', require('./routes/habits'));

app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.get('/debug', async (req, res) => {
  const db = require('./db');
  const [users] = await db.execute('SELECT id, username FROM users');
  const [users] = await db.execute('SELECT * FROM users');
  const [habits] = await db.execute('SELECT * FROM habits');
  const [logs] = await db.execute('SELECT * FROM habit_logs');
  res.json({ users, habits, logs });
  const [tables] = await db.execute('SHOW TABLES');
  res.json(tables);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));