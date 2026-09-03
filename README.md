# Ranniti Backend

A lightweight Express backend with JWT authentication and file-based user storage.

## Setup

1. Install dependencies:
   npm install
2. Start the app:
   npm start
3. For development auto-reload:
   npm run dev

## Deploy

Upload or connect the project root (the folder containing `package.json`) to Vercel or Netlify.

### Vercel

Vercel uses the included `vercel.json`. No build command is required; the project runs through `server.js`.

### Netlify

Netlify uses the included `netlify.toml` and `netlify/functions/server.js`. No publish directory is required.

The registration, payment, and confirmation pages are available at `/register`, `/payment`, and `/confirmation`.

## Environment

Copy `.env.example` to `.env` and update the values if needed.

## API endpoints

- `GET /api`
- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/users`
- `GET /api/users/me`

## Example request

Register:

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane","email":"jane@example.com","password":"secret123"}'
```

Login:

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","password":"secret123"}'
```
