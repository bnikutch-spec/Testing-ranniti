import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './src/routes/auth.js';
import userRoutes from './src/routes/users.js';
import registrationRoutes from './src/routes/registrations.js';
import { initializeDatabase } from './src/config/database.js';

const app = express();
const port = process.env.PORT || 5000;
const currentFile = fileURLToPath(import.meta.url);
const projectRoot = path.dirname(currentFile);
const publicRoot = path.join(projectRoot, 'public');

await initializeDatabase();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.sendFile(path.join(publicRoot, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(projectRoot, 'Admin5.html'));
});

app.get('/auth', (req, res) => {
  res.sendFile(path.join(projectRoot, 'Admin5.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(publicRoot, 'register.html'));
});

app.get('/payment', (req, res) => {
  res.sendFile(path.join(publicRoot, 'payment.html'));
});

app.get('/confirmation', (req, res) => {
  res.sendFile(path.join(publicRoot, 'confirmation.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(publicRoot, 'login.html'));
});

app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(publicRoot, 'reset-password.html'));
});

app.get('/member', (req, res) => {
  res.sendFile(path.join(publicRoot, 'member.html'));
});

app.get('/Admin5.html', (req, res) => {
  res.sendFile(path.join(projectRoot, 'Admin5.html'));
});

app.use(express.static(publicRoot));

app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'Ranniti backend is running',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    uptime: process.uptime(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api', registrationRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

if (!process.env.VERCEL && !process.env.NETLIFY) {
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
}

export default app;
