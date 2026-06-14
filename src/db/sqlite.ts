import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.resolve(__dirname, '../../.tmp');
const DB_FILE = path.join(DB_DIR, 'xeno_crm.db');

// Ensure db directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Connect to SQLite Database
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database:', err.message);
  } else {
    console.log(`Connected to SQLite database at: ${DB_FILE}`);
  }
});

// Enable foreign key constraints
db.run('PRAGMA foreign_keys = ON;');

// Promisified DB helpers
export const query = {
  run(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  },

  get<T>(sql: string, params: any[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row as T);
      });
    });
  },

  all<T>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }
};

// Initialize schema
export const initDatabase = async () => {
  try {
    // Customers Table
    await query.run(`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    // Orders Table
    await query.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT NOT NULL,
        items TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
      )
    `);

    // Segments Table
    await query.run(`
      CREATE TABLE IF NOT EXISTS segments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        rules TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    // Campaigns Table
    await query.run(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        segment_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        message_template TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (segment_id) REFERENCES segments (id) ON DELETE CASCADE
      )
    `);

    // Communication Logs Table
    await query.run(`
      CREATE TABLE IF NOT EXISTS communication_logs (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        conversion_amount REAL,
        FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
        FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
      )
    `);

    // Schema Migrations (Add new columns for advanced features)
    try {
      await query.run('ALTER TABLE customers ADD COLUMN churn_risk_score INTEGER DEFAULT 0');
    } catch (e) {}

    try {
      await query.run('ALTER TABLE orders ADD COLUMN campaign_id TEXT');
    } catch (e) {}

    try {
      await query.run('ALTER TABLE campaigns ADD COLUMN message_variants TEXT');
    } catch (e) {}

    try {
      await query.run('ALTER TABLE campaigns ADD COLUMN excluded_fatigue INTEGER DEFAULT 0');
    } catch (e) {}

    try {
      await query.run('ALTER TABLE communication_logs ADD COLUMN variant_id TEXT');
    } catch (e) {}

    try {
      await query.run('ALTER TABLE communication_logs ADD COLUMN variant_text TEXT');
    } catch (e) {}

    console.log('Database tables initialized successfully.');
  } catch (error) {
    console.error('Error initializing database tables:', error);
    throw error;
  }
};

export default db;
