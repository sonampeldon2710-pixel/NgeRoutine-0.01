require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const app     = express();
const db      = require('./db');

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
}));
app.options('*', cors());
app.use(express.json());

const path = require('path');
const frontendPath = path.join(__dirname, '..');
app.use(express.static(frontendPath));

app.get('/', (req, res) => {
  const indexPath = path.join(frontendPath, 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ message: "Backend is running!", api_status: "ok" });
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

app.use('/api/auth',      require('./routes/auth'));
app.use('/api/habits',    require('./routes/habits'));
app.use('/api/logs',      require('./routes/logs'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/checkins',  require('./routes/checkins'));
app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.get('/admin', async (req, res) => {
  if (req.query.key !== 'spt2026') {
    return res.status(401).send('Unauthorized');
  }

  const selectedUser = req.query.user_id ? parseInt(req.query.user_id) : null;

  const [users]     = await db.execute('SELECT id, username, full_name, created_at FROM users');
  const [logs]      = selectedUser
    ? await db.execute('SELECT * FROM logs WHERE user_id=? ORDER BY created_at DESC', [selectedUser])
    : await db.execute('SELECT * FROM logs ORDER BY created_at DESC');
  const [checkins]  = selectedUser
    ? await db.execute('SELECT * FROM checkin_history WHERE user_id=? ORDER BY date DESC', [selectedUser])
    : await db.execute('SELECT * FROM checkin_history ORDER BY date DESC');
  const [schedules] = selectedUser
    ? await db.execute('SELECT * FROM schedules WHERE user_id=? ORDER BY created_at DESC', [selectedUser])
    : await db.execute('SELECT * FROM schedules ORDER BY created_at DESC');

  function toBT(val) {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d)) return val;
    return d.toLocaleString('en-BT', { timeZone: 'Asia/Thimphu',
      year:'numeric', month:'short', day:'2-digit',
      hour:'2-digit', minute:'2-digit', hour12: true });
  }

  function formatVal(key, val) {
    if (val === null || val === undefined) return '';
    if (['created_at', 'updated_at', 'date', 'logged_at'].includes(key)) return toBT(val);
    if (typeof val === 'object') return `<pre style="margin:0;font-size:11px">${JSON.stringify(val, null, 2)}</pre>`;
    return val;
  }

  function makeTable(rows) {
    if (!rows.length) return '<p style="color:#888">No data</p>';
    const keys = Object.keys(rows[0]);
    return `<table>
      <tr>${keys.map(k => `<th>${k}</th>`).join('')}</tr>
      ${rows.map(r => `<tr>${keys.map(k => `<td>${formatVal(k, r[k])}</td>`).join('')}</tr>`).join('')}
    </table>`;
  }

  const userOptions = users.map(u =>
    `<option value="${u.id}" ${selectedUser===u.id?'selected':''}>
      ${u.username} (ID: ${u.id})
    </option>`
  ).join('');

  res.send(`
    <html>
    <head>
      <title>Admin Panel</title>
      <style>
        body { font-family: sans-serif; padding: 20px; background: #0f0f0f; color: #eee; }
        h2 { color: #1D9E75; border-bottom: 1px solid #333; padding-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 40px; font-size: 13px; }
        th { background: #1D9E75; color: white; padding: 8px 12px; text-align: left; }
        td { padding: 8px 12px; border-bottom: 1px solid #222; vertical-align: top; }
        tr:hover td { background: #1a1a1a; }
        pre { background: #1a1a1a; padding: 4px; border-radius: 4px; max-width: 300px; overflow: auto; }
        select { background: #222; color: #eee; padding: 10px 16px; border-radius: 8px;
                 border: 1px solid #1D9E75; font-size: 14px; cursor: pointer; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <h1>🛠 Admin Panel <small style="font-size:14px;color:#888">Bhutan Time (UTC+6)</small></h1>

      <h2>👤 Users (${users.length})</h2>${makeTable(users)}

      <select onchange="location.href='/admin?key=spt2026'+(this.value?'&user_id='+this.value:'')">
        <option value="">👥 All Users</option>
        ${userOptions}
      </select>
      
      <h2>📋 Logs (${logs.length})</h2>${makeTable(logs)}
      <h2>✅ Check-ins (${checkins.length})</h2>${makeTable(checkins)}
      <h2>🗓 Schedules (${schedules.length})</h2>${makeTable(schedules)}
    </body>
    </html>
  `);
});

app.get('/debug', async (req, res) => {
  const [users]        = await db.execute('SELECT * FROM users');
  const [habits]       = await db.execute('SELECT * FROM habits');
  const [habit_logs]   = await db.execute('SELECT * FROM habit_logs');
  const [habit_trends] = await db.execute('SELECT * FROM habit_trends');
  const [profiles]     = await db.execute('SELECT * FROM profiles');
  res.json({ users, habits, habit_logs, habit_trends, profiles });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));