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

// GET /api/schedules
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM schedules WHERE user_id=? ORDER BY date ASC, from_time ASC',
      [req.userId]
    );
    res.json(rows.map(r => ({
      ...r,
      tasks: r.tasks ? JSON.parse(r.tasks) : []
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/schedules
router.post('/', auth, async (req, res) => {
  const { category, date, from_time, to_time, duration_mins, tasks } = req.body;
  if (!category || !date)
    return res.status(400).json({ error: 'category and date required.' });
  try {
    const [result] = await db.execute(
      `INSERT INTO schedules (user_id,category,date,from_time,to_time,duration_mins,tasks)
       VALUES (?,?,?,?,?,?,?)`,
      [req.userId, category, date, from_time, to_time,
       duration_mins || 0, JSON.stringify(tasks || [])]
    );
    res.json({ id: result.insertId, message: 'Schedule created.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/schedules/:id — full update
router.put('/:id', auth, async (req, res) => {
  const { category, date, from_time, to_time, duration_mins, tasks } = req.body;
  try {
    const [result] = await db.execute(
      `UPDATE schedules SET category=?,date=?,from_time=?,to_time=?,
         duration_mins=?,tasks=?,updated_at=NOW()
       WHERE id=? AND user_id=?`,
      [category, date, from_time, to_time, duration_mins || 0,
       JSON.stringify(tasks || []), req.params.id, req.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Not found.' });
    res.json({ message: 'Updated.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/schedules/:id/tasks — toggle one task done/undone
router.patch('/:id/tasks', auth, async (req, res) => {
  const { taskIndex, done } = req.body;
  try {
    const [rows] = await db.execute(
      'SELECT tasks FROM schedules WHERE id=? AND user_id=?',
      [req.params.id, req.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found.' });
    const tasks = rows[0].tasks ? JSON.parse(rows[0].tasks) : [];
    if (taskIndex < 0 || taskIndex >= tasks.length)
      return res.status(400).json({ error: 'Invalid task index.' });
    tasks[taskIndex].done = !!done;
    await db.execute(
      'UPDATE schedules SET tasks=?,updated_at=NOW() WHERE id=? AND user_id=?',
      [JSON.stringify(tasks), req.params.id, req.userId]
    );
    res.json({ message: 'Task updated.', tasks });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/schedules/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const [result] = await db.execute(
      'DELETE FROM schedules WHERE id=? AND user_id=?',
      [req.params.id, req.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Not found.' });
    res.json({ message: 'Deleted.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;