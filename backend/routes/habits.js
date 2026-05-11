const router = require('express').Router();
const auth   = require('../middleware/auth');
const db     = require('../db');

async function getProfileId(userId) {
  const [[p]] = await db.execute(
    'SELECT id FROM profiles WHERE user_id = ?', [userId]
  );
  return p?.id;
}

router.get('/', auth, async (req, res) => {
  const profileId = await getProfileId(req.userId);
  const [rows] = await db.execute(
    'SELECT * FROM habits WHERE profile_id = ? ORDER BY created_at DESC', [profileId]
  );
  res.json(rows);
});

router.post('/', auth, async (req, res) => {
  const profileId = await getProfileId(req.userId);
  const { name, category } = req.body;
  const [result] = await db.execute(
    'INSERT INTO habits (profile_id, name, category) VALUES (?, ?, ?)',
    [profileId, name, category || null]
  );
  res.json({ id: result.insertId, name, category });
});

// ✅ specific routes FIRST
router.post('/logs', auth, async (req, res) => {
  const profileId = await getProfileId(req.userId);
  const { habitId, habitName, habitIcon, date, duration, unit, startTime, endTime, note } = req.body;
  const [result] = await db.execute(
    'INSERT INTO habit_logs (habit_id, value, note, logged_at) VALUES (?, ?, ?, ?)',
    [habitId, duration, note || null, date]
  );
  res.json({ id: result.insertId });
});

router.get('/logs', auth, async (req, res) => {
  const profileId = await getProfileId(req.userId);
  const [rows] = await db.execute(
    `SELECT hl.* FROM habit_logs hl
     JOIN habits h ON h.id = hl.habit_id
     WHERE h.profile_id = ?
     ORDER BY hl.logged_at DESC LIMIT 500`,
    [profileId]
  );
  res.json(rows);
});

// ✅ dynamic routes AFTER
router.post('/:habitId/logs', auth, async (req, res) => {
  const { value, note } = req.body;
  await db.execute(
    'INSERT INTO habit_logs (habit_id, value, note) VALUES (?, ?, ?)',
    [req.params.habitId, value ?? null, note ?? null]
  );
  res.json({ success: true });
});

router.get('/:habitId/logs', auth, async (req, res) => {
  const [rows] = await db.execute(
    'SELECT * FROM habit_logs WHERE habit_id = ? ORDER BY logged_at DESC LIMIT 90',
    [req.params.habitId]
  );
  res.json(rows);
});

router.get('/:habitId/trends', auth, async (req, res) => {
  const [rows] = await db.execute(
    'SELECT * FROM habit_trends WHERE habit_id = ? ORDER BY week_start DESC LIMIT 12',
    [req.params.habitId]
  );
  res.json(rows);
});

module.exports = router;
