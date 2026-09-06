## Payment and entry workflow

The application stores registrations, payments, invoices, entry passes, email logs, and check-ins in MongoDB. Admins authenticate through JWT and confirm payments from `/admin`.

Copy `.env.example` to `.env` and configure `MONGODB_URI` and `MONGODB_DB`. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` for real Razorpay checkout orders. Set `BREVO_API_KEY`, `BREVO_SENDER_NAME`, and `BREVO_SENDER_EMAIL` for real confirmation email delivery. Manual UPI/UTR submissions are stored as `Received` for admin review.

Run locally:

```bash
npm install
npm start
```

The admin account must be created through `/api/auth/register` using the exact email configured as `ADMIN_EMAIL`, then used at `/admin`. Confirmation creates sequential `RN5-INV-001` invoices and `RN5-001` entry passes using MongoDB atomic counters, stores a unique QR token, sends both PDFs through Brevo, and makes QR/manual check-in idempotent.
# Ranniti Backend

A lightweight Express backend with JWT authentication and file-based user storage.

## Setup

1. Install dependencies:
   npm install
2. Configure MongoDB:
   - Copy `.env.example` to `.env`.
   - For a local MongoDB server, keep `MONGODB_URI=mongodb://127.0.0.1:27017`.
   - For MongoDB Atlas, set `MONGODB_URI` to the connection string from Atlas and set `MONGODB_DB` to `ranniti5` (or another database name).
   - In Atlas, add the machine running this app under **Network Access** and create a database user under **Database Access**.
3. Start the app:
   npm start
4. For development auto-reload:
   npm run dev

The server connects to MongoDB during startup, creates the required collections' indexes, and then serves the website. A failed connection means the configured MongoDB URI is unreachable or invalid; check `.env`, the Atlas network allowlist, and the database user's credentials.

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
