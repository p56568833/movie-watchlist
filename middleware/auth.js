const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'mw-secret-change-in-production';

const errMsg = (err, fallback) =>
  process.env.NODE_ENV === 'production' ? fallback : (err.message || fallback);

function authMiddleware(req, res, next) {
  if (req.path === '/auth/login' || req.path === '/auth/register' || req.path.startsWith('/tmdb/') || req.originalUrl === '/health') {
    return next();
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '请先登录' });
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.id;
    req.user = { id: payload.id, username: payload.username };
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

module.exports = { JWT_SECRET, errMsg, authMiddleware };
