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
