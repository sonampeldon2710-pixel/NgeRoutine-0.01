const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken'); // add this

// add auth middleware
function auth(req, res, next) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token.' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ error: 'Invalid token.' });
  }
}

router.post('/', auth, async (req, res) => {  // 👈 add auth here
  try {
    const { answers, lAnswers, score } = req.body;
    const date = new Date().toISOString().split('T')[0];
    const userId = req.user.userId;

    await db.execute(
      `INSERT INTO checkin_history (user_id, date, answers, l_answers, score)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, date, JSON.stringify(answers), JSON.stringify(lAnswers), score]
    );

    res.json({ success: true });
  } catch(e) {
    console.error('checkin save error:', e);
    res.status(500).json({ error: 'Failed to save check-in' });
  }
});

module.exports = router;