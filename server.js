import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './src/routes/auth.js';
import userRoutes from './src/routes/users.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.sendFile('index.html', { root: 'public' });
});

app.get('/admin', (req, res) => {
  res.sendFile('Admin5.html', { root: '.' });
});

app.get('/auth', (req, res) => {
  res.sendFile('Admin5.html', { root: '.' });
});

app.get('/register', (req, res) => {
  res.sendFile('register.html', { root: 'public' });
});

app.get('/payment', (req, res) => {
  res.sendFile('payment.html', { root: 'public' });
});

app.get('/confirmation', (req, res) => {
  res.sendFile('confirmation.html', { root: 'public' });
});

app.get('/Admin5.html', (req, res) => {
  res.sendFile('Admin5.html', { root: '.' });
});

app.use(express.static('public'));

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

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
}

export default app;
