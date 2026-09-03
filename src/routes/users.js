import express from 'express';
import { adminMiddleware, authMiddleware } from '../middleware/authMiddleware.js';
import { all, get } from '../config/database.js';

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  const users = await all(
    'SELECT id, name, email, role, created_at, updated_at FROM users ORDER BY created_at DESC'
  );

  return res.json({
    success: true,
    users: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    })),
  });
});

router.get('/me', authMiddleware, async (req, res) => {
  const user = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  const { password_hash: _, ...safeUser } = user;

  return res.json({
    success: true,
    user: {
      id: safeUser.id,
      name: safeUser.name,
      email: safeUser.email,
      role: safeUser.role,
      createdAt: safeUser.created_at,
      updatedAt: safeUser.updated_at,
    },
  });
});

router.get('/admin-only', authMiddleware, adminMiddleware, async (req, res) => {
  return res.json({
    success: true,
    message: 'Admin access granted',
    admin: req.user,
  });
});

export default router;
