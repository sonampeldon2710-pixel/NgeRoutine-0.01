const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const router = express.Router();

// Middleware to protect routes
function auth(req, res, next) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token.' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Ensure we set req.userId to match what the routes expect
    req.userId = decoded.userId; 
    req.user = decoded; 
    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid token.' });
  }
}

// SIGNUP: Creates User AND Profile
router.post('/signup', async (req, res) => {
  const { full_name: name, username, password } = req.body;
  if (!name || !username || !password) return res.status(400).json({ error: 'All fields required.' });

  try {
    const [existing] = await db.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length) return res.status(409).json({ error: 'Username taken.' });

    const hash = await bcrypt.hash(password, 10);
    // 1. Insert User
    const [result] = await db.execute(
      'INSERT INTO users (username, full_name, password_hash) VALUES (?,?,?)',
      [username, name, hash]
    );

    // 2. Insert Profile (Prevents 500 errors later)
    await db.execute(
      'INSERT INTO profiles (user_id, full_name) VALUES (?, ?)',
      [result.insertId, name]
    );

    const token = jwt.sign({ userId: result.insertId }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: result.insertId, name, username } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
    if (!rows.length) return res.status(401).json({ error: 'Incorrect credentials.' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Incorrect credentials.' });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.full_name, username: user.username } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// UPDATE PROFILE (The one that was 403-ing)
// should look like this now
router.put('/update', auth, async (req, res) => {
  const { full_name: name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required.' });
  try {
    await db.execute(
      'UPDATE users SET full_name=? WHERE id=?',
      [name, req.userId]
    );
    res.json({ message: 'Name updated.', name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;