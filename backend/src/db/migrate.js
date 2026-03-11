'use strict';

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function migrate() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`Running migration: ${file}`);
    try {
      await pool.query(sql);
      console.log(`✓ ${file}`);
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log(`  (already applied) ${file}`);
      } else {
        console.error(`✗ ${file}:`, err.message);
        process.exit(1);
      }
    }
  }

  await pool.end();
  console.log('Migrations complete.');
}

migrate();
