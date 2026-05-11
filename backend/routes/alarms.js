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

// ── HABIT ALARMS ──────────────────────────────────

// GET /api/alarms
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM alarms WHERE user_id = ?', [req.userId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/alarms — create or update
router.post('/', auth, async (req, res) => {
  const { habit_id, from_time, to_time, sound } = req.body;
  if (!habit_id) return res.status(400).json({ error: 'habit_id required.' });
  try {
    await db.execute(
      `INSERT INTO alarms (user_id, habit_id, from_time, to_time, active, sound)
       VALUES (?,?,?,?,1,?)
       ON DUPLICATE KEY UPDATE from_time=VALUES(from_time), to_time=VALUES(to_time),
         active=1, sound=VALUES(sound)`,
      [req.userId, habit_id, from_time, to_time, sound || 'bell']
    );
    res.json({ message: 'Alarm saved.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/alarms/:habitId — clear alarm
router.delete('/:habitId', auth, async (req, res) => {
  try {
    await db.execute(
      'UPDATE alarms SET active=0 WHERE user_id=? AND habit_id=?',
      [req.userId, req.params.habitId]
    );
    res.json({ message: 'Alarm cleared.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── QUICK ALARMS ──────────────────────────────────

// GET /api/alarms/quick
router.get('/quick', auth, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM quick_alarms WHERE user_id=? ORDER BY date DESC, from_time ASC',
      [req.userId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/alarms/quick
router.post('/quick', auth, async (req, res) => {
  const {
    date, from_time, to_time, from_display, to_display,
    duration, duration_mins, duration_hrs, category, sound
  } = req.body;
  if (!date || !category)
    return res.status(400).json({ error: 'date and category required.' });
  try {
    const [result] = await db.execute(
      `INSERT INTO quick_alarms
        (user_id,date,from_time,to_time,from_display,to_display,
         duration,duration_mins,duration_hrs,category,sound)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [req.userId, date, from_time, to_time, from_display, to_display,
       duration, duration_mins || 0, duration_hrs || 0, category, sound || 'bell']
    );
    res.json({ id: result.insertId, message: 'Quick alarm saved.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/alarms/quick/:id
router.delete('/quick/:id', auth, async (req, res) => {
  try {
    const [result] = await db.execute(
      'DELETE FROM quick_alarms WHERE id=? AND user_id=?',
      [req.params.id, req.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Not found.' });
    res.json({ message: 'Deleted.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;