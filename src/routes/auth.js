import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { get, run } from '../config/database.js';

const router = express.Router();

const generateToken = (user) => jwt.sign(
  { id: user.id, email: user.email, name: user.name, role: user.role || 'user' },
  process.env.JWT_SECRET || 'ranniti-dev-secret',
  { expiresIn: '7d' }
);

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Name, email, and password are required',
    });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedName = String(name).trim();

  if (!normalizedName || !normalizedEmail || !String(password).trim()) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user details provided',
    });
  }

  const existingUser = await get('SELECT id FROM users WHERE email = ?', [normalizedEmail]);

  if (existingUser) {
    return res.status(409).json({
      success: false,
      message: 'User already exists',
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const createdAt = new Date().toISOString();
  const userId = uuidv4();

  const role = normalizedEmail.endsWith('@admin.com') ? 'admin' : 'user';

  await run(
    'INSERT INTO users (id, name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, normalizedName, normalizedEmail, passwordHash, role, createdAt, createdAt]
  );

  const user = {
    id: userId,
    name: normalizedName,
    email: normalizedEmail,
    role,
    createdAt,
    updatedAt: createdAt,
  };

  return res.status(201).json({
    success: true,
    message: 'User registered successfully',
    user,
    token: generateToken(user),
  });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required',
    });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await get('SELECT * FROM users WHERE email = ?', [normalizedEmail]);

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password',
    });
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash);

  if (!isValidPassword) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password',
    });
  }

  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };

  return res.json({
    success: true,
    message: 'Login successful',
    user: safeUser,
    token: generateToken(safeUser),
  });
});

router.post('/logout', (req, res) => {
  res.json({
    success: true,
    message: 'Logout successful',
  });
});

export default router;
