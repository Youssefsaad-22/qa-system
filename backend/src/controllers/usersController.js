import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';

export const listUsers = async (req, res) => {
  try {
    const result = await query(
      `SELECT user_id, username, role, created_at
       FROM users
       WHERE is_active = TRUE
       ORDER BY role, username`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const cleanUsername = String(username).trim();
    if (cleanUsername.length < 3 || cleanUsername.length > 50) {
      return res.status(400).json({ error: 'Username must be between 3 and 50 characters' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      return res.status(400).json({ error: 'Username may only contain letters, numbers, and underscores' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await query('SELECT 1 FROM users WHERE username = $1', [cleanUsername]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, 'QA_WORKER')
       RETURNING user_id, username, role, created_at`,
      [cleanUsername, hash]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const result = await query('SELECT user_id, username, role, is_active FROM users WHERE user_id = $1', [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    if (user.role !== 'QA_WORKER') {
      return res.status(400).json({ error: 'Only QA worker accounts can be deleted' });
    }
    if (user.user_id === req.user.userId) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    if (!user.is_active) {
      return res.status(409).json({ error: 'User is already deleted' });
    }

    await query('UPDATE users SET is_active = FALSE WHERE user_id = $1', [userId]);

    res.json({ message: `QA worker "${user.username}" deleted` });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};