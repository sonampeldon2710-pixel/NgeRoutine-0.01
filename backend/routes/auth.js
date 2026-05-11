// const express = require('express');
// const bcrypt = require('bcryptjs');
// const jwt = require('jsonwebtoken');
// const db = require('../db');
// const router = express.Router();

// // Middleware to protect routes and extract userId from Token
// function auth(req, res, next) {
//   const token = (req.headers['authorization'] || '').replace('Bearer ', '');
//   if (!token) return res.status(401).json({ error: 'No token.' });
  
//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     // Setting both for compatibility across your app
//     req.user = decoded; 
//     req.userId = decoded.userId; 
//     next();
//   } catch (err) {
//     res.status(403).json({ error: 'Invalid token.' });
//   }
// }

// // POST /api/auth/signup
// router.post('/signup', async (req, res) => {
//   const { name, username, password } = req.body;

//   if (!name || !username || !password)
//     return res.status(400).json({ error: 'All fields required.' });
//   if (username.length < 3)
//     return res.status(400).json({ error: 'Username min 3 characters.' });
//   if (password.length < 6)
//     return res.status(400).json({ error: 'Password min 6 characters.' });

//   try {
//     const [existing] = await db.execute('SELECT id FROM users WHERE username = ?', [username]);
//     if (existing.length)
//       return res.status(409).json({ error: 'Username already taken.' });

//     const hash = await bcrypt.hash(password, 10);
    
//     // 1. Create User
//     const [result] = await db.execute(
//       'INSERT INTO users (username, full_name, password_hash) VALUES (?,?,?)',
//       [username, name, hash]
//     );

//     // 2. Create Profile (Links user to habits)
//     await db.execute(
//       'INSERT INTO profiles (user_id, full_name) VALUES (?, ?)',
//       [result.insertId, name]
//     );

//     const token = jwt.sign({ userId: result.insertId }, process.env.JWT_SECRET, { expiresIn: '7d' });
//     res.json({ token, user: { id: result.insertId, name, username } });
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

// // POST /api/auth/login
// router.post('/login', async (req, res) => {
//   const { username, password } = req.body;
//   if (!username || !password)
//     return res.status(400).json({ error: 'Username and password required.' });

//   try {
//     const [rows] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
//     if (!rows.length)
//       return res.status(401).json({ error: 'Incorrect username or password.' });

//     const user = rows[0];
//     const match = await bcrypt.compare(password, user.password_hash);
//     if (!match)
//       return res.status(401).json({ error: 'Incorrect username or password.' });

//     const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
//     res.json({ token, user: { id: user.id, name: user.full_name, username: user.username } });
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

// // GET /api/auth/me
// router.get('/me', auth, async (req, res) => {
//   try {
//     const [rows] = await db.execute(
//       'SELECT id, username, full_name AS name, created_at, last_changed FROM users WHERE id = ?',
//       [req.userId]
//     );
//     if (!rows.length) return res.status(404).json({ error: 'User not found.' });
//     res.json(rows[0]);
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

// // PUT /api/auth/update
// router.put('/update', auth, async (req, res) => {
//   const { name, username, currentPassword, newPassword } = req.body;
//   if (!name || !username || !currentPassword)
//     return res.status(400).json({ error: 'Name, username and current password required.' });

//   try {
//     const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [req.userId]);
//     if (!rows.length) return res.status(404).json({ error: 'User not found.' });

//     const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
//     if (!match) return res.status(401).json({ error: 'Current password incorrect.' });

//     if (username !== rows[0].username) {
//       const [conflict] = await db.execute('SELECT id FROM users WHERE username = ?', [username]);
//       if (conflict.length) return res.status(409).json({ error: 'Username taken.' });
//     }

//     const finalHash = newPassword ? await bcrypt.hash(newPassword, 10) : rows[0].password_hash;
    
//     // Using NOW() for last_changed
//     await db.execute(
//       'UPDATE users SET full_name=?, username=?, password_hash=?, last_changed=NOW() WHERE id=?',
//       [name, username, finalHash, req.userId]
//     );
    
//     res.json({ message: 'Profile updated.' });
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

// // POST /api/auth/reset-password
// router.post('/reset-password', async (req, res) => {
//   const { username, newPassword } = req.body;
//   if (!username || !newPassword)
//     return res.status(400).json({ error: 'Username and new password required.' });
  
//   try {
//     const [rows] = await db.execute('SELECT id FROM users WHERE username = ?', [username]);
//     if (!rows.length) return res.status(404).json({ error: 'No account found.' });

//     const hash = await bcrypt.hash(newPassword, 10);
//     await db.execute(
//       'UPDATE users SET password_hash=?, last_changed=NOW() WHERE username=?', 
//       [hash, username]
//     );
//     res.json({ message: 'Password reset successful.' });
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

// // DELETE /api/auth/delete
// router.delete('/delete', auth, async (req, res) => {
//   const { password } = req.body;
//   try {
//     const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [req.userId]);
//     if (!rows.length) return res.status(404).json({ error: 'User not found.' });

//     const match = await bcrypt.compare(password, rows[0].password_hash);
//     if (!match) return res.status(401).json({ error: 'Incorrect password.' });

//     await db.execute('DELETE FROM users WHERE id = ?', [req.userId]);
//     res.json({ message: 'Account deleted.' });
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

// module.exports = router;


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
  const { name, username, password } = req.body;
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
router.put('/update', auth, async (req, res) => {
  const { name, username, currentPassword, newPassword } = req.body;
  try {
    const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [req.userId]);
    const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!match) return res.status(401).json({ error: 'Current password incorrect.' });

    const finalHash = newPassword ? await bcrypt.hash(newPassword, 10) : rows[0].password_hash;
    
    await db.execute(
      'UPDATE users SET full_name=?, username=?, password_hash=?, last_changed=NOW() WHERE id=?',
      [name, username, finalHash, req.userId]
    );
    res.json({ message: 'Profile updated.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;