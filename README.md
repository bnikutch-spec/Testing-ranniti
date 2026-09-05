## Payment and entry workflow

The application now stores registrations, payments, invoices, entry passes, email logs, and check-ins in SQLite. The public registration and payment forms call the API; admins authenticate through JWT and confirm payments from `/admin`.

Copy `.env.example` to `.env` and set `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` for Razorpay orders. Set the SMTP variables for real confirmation email delivery. Until Razorpay keys are configured, the existing UPI/UTR form records a payment as `Received` for admin review.

Run locally:

```bash
npm install
npm start
```

The admin account must be created through `/api/auth/register` with an email ending in `@admin.com`, then used at `/admin`. Confirmation creates sequential `RN5-INV-001` invoices and `RN5-001` entry passes, stores a unique QR token, sends both PDFs, and makes QR/manual check-in idempotent.
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
