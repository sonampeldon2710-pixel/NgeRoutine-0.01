const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Use userId to match your JWT signing logic
    req.userId = decoded.userId; 
    // Also attach to req.user for compatibility with other routes
    req.user = decoded; 
    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid or expired token.' });
  }
};