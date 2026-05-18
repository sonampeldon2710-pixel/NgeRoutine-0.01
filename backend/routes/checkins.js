const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware');

router.post('/', async (req, res) => {
  try {
    const { date, answers, lAnswers, score } = req.body;
    const userId = req.user.id;

    await db.query(
      `INSERT INTO checkins (user_id, date, answers, lanswers, score)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, date, JSON.stringify(answers), JSON.stringify(lAnswers), score]
    );

    res.json({ success: true });
  } catch(e) {
    console.error('checkin save error:', e);
    res.status(500).json({ error: 'Failed to save check-in' });
  }
});

module.exports = router;