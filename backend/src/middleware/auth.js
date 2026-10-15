import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_SECRET = 'your-super-secret-jwt-key-change-in-production';
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET === DEFAULT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL: JWT_SECRET must be set to a unique, strong value in production. ' +
      'Set JWT_SECRET in backend/.env and restart.'
    );
  }
}

const secret = JWT_SECRET || DEFAULT_SECRET;

export const generateToken = (user) => {
  return jwt.sign(
    { userId: user.user_id, username: user.username, role: user.role },
    secret,
    { expiresIn: '8h' }
  );
};

export const verifyToken = (token) => {
  return jwt.verify(token, secret);
};

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};