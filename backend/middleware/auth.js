const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token.' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.user = decoded;
    next();
  } catch(err) {
    res.status(403).json({ error: 'Invalid token.' });
  }
}

module.exports = { authenticateToken };