const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/', async (req, res) => {
  try {
    const { answers, lAnswers, score } = req.body;
    const date = new Date().toISOString().split('T')[0]; // fix: plain date only
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