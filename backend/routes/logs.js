const express = require('express');
const jwt     = require('jsonwebtoken');
const db      = require('../db');
const router  = express.Router();

function auth(req, res, next) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token.' });
  try { req.userId = jwt.verify(token, process.env.JWT_SECRET).userId; next(); }
  catch { res.status(403).json({ error: 'Invalid token.' }); }
}

// GET /api/logs — all logs for this user
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM logs WHERE user_id = ? ORDER BY date DESC, created_at DESC',
      [req.userId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/logs — save a new log
router.post('/', auth, async (req, res) => {
  const {
    habit_id, habit_name, habit_icon, date,
    duration, unit, start_time, end_time,
    note, is_schedule, is_quick_alarm, schedule_id
  } = req.body;

  if (!date) return res.status(400).json({ error: 'date is required.' });

  try {
    const [result] = await db.execute(
      `INSERT INTO logs
        (user_id, habit_id, habit_name, habit_icon, date, duration, unit,
         start_time, end_time, note, is_schedule, is_quick_alarm, schedule_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        req.userId, habit_id, habit_name, habit_icon, date,
        duration || 0, unit || 'hrs', start_time || null,
        end_time || null, note || null,
        is_schedule ? 1 : 0, is_quick_alarm ? 1 : 0,
        schedule_id || null
      ]
    );
    res.json({ id: result.insertId, message: 'Log saved.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/logs/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const [result] = await db.execute(
      'DELETE FROM logs WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Log not found.' });
    res.json({ message: 'Deleted.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/logs/checkins
router.get('/checkins', auth, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM checkin_history WHERE user_id = ? ORDER BY date ASC',
      [req.userId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/logs/checkins
router.post('/checkins', auth, async (req, res) => {
  const { score, answers, l_answers } = req.body;
  try {
    const [result] = await db.execute(
      'INSERT INTO checkin_history (user_id, score, answers, l_answers) VALUES (?,?,?,?)',
      [req.userId, score || 0, JSON.stringify(answers), JSON.stringify(l_answers)]
    );
    res.json({ id: result.insertId, message: 'Check-in saved.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;