import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const sqlite = sqlite3.verbose();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'data', 'ranniti.db');

const db = new sqlite.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite:', err.message);
  } else {
    console.log('Connected to SQLite database');
  }
});

const initializeDatabase = () => {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS admin_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        default_role TEXT NOT NULL DEFAULT 'user'
      )
    `);

    db.run(`
      INSERT OR IGNORE INTO admin_settings (id, default_role) VALUES (1, 'user')
    `);

    db.run(`CREATE TABLE IF NOT EXISTS registrations (
      id TEXT PRIMARY KEY, full_name TEXT NOT NULL, email TEXT NOT NULL, mobile TEXT,
      company TEXT, guest_name TEXT, region TEXT, chapter TEXT, gst_number TEXT, city TEXT,
      date_of_birth TEXT, hoodie_size TEXT, business_intent TEXT, package_name TEXT NOT NULL,
      amount REAL NOT NULL, status TEXT NOT NULL DEFAULT 'Pending', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY, registration_id TEXT NOT NULL UNIQUE, transaction_id TEXT,
      amount REAL NOT NULL, status TEXT NOT NULL DEFAULT 'Pending', gateway TEXT NOT NULL DEFAULT 'manual',
      gateway_order_id TEXT, payment_date TEXT, proof_path TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (registration_id) REFERENCES registrations(id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY, registration_id TEXT NOT NULL UNIQUE, invoice_number TEXT NOT NULL UNIQUE,
      file_path TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (registration_id) REFERENCES registrations(id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS entry_passes (
      id TEXT PRIMARY KEY, registration_id TEXT NOT NULL UNIQUE, pass_number TEXT NOT NULL UNIQUE,
      qr_token TEXT NOT NULL UNIQUE, file_path TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (registration_id) REFERENCES registrations(id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS checkins (
      id TEXT PRIMARY KEY, entry_pass_number TEXT NOT NULL, registration_id TEXT NOT NULL,
      member_name TEXT NOT NULL, checked_at TEXT NOT NULL, method TEXT NOT NULL, checked_by TEXT NOT NULL,
      FOREIGN KEY (registration_id) REFERENCES registrations(id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS email_logs (
      id TEXT PRIMARY KEY, registration_id TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT NOT NULL,
      status TEXT NOT NULL, sent_at TEXT NOT NULL, error TEXT, FOREIGN KEY (registration_id) REFERENCES registrations(id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS sequences (name TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0)`);
    db.run(`INSERT OR IGNORE INTO sequences (name, value) VALUES ('invoice', 0), ('entry_pass', 0)`);
  });
};

initializeDatabase();

export const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function onRun(err) {
    if (err) {
      reject(err);
      return;
    }
    resolve({ id: this.lastID, changes: this.changes });
  });
});

export const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) {
      reject(err);
      return;
    }
    resolve(row);
  });
});

export const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) {
      reject(err);
      return;
    }
    resolve(rows);
  });
});

export default db;
