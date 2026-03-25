'use strict';

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function migrate() {
  const client = await pool.connect();

  try {
    // Ensure migration tracking table exists (always safe to run)
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      // Skip if already successfully applied
      const { rows } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [file]
      );
      if (rows.length) {
        console.log(`  (already applied) ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`Running migration: ${file}`);

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`✓ ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        // Se os objetos já existem (42P07 = duplicate_table, 42701 = duplicate_column,
        // 42710 = duplicate_object), registra como aplicada e continua.
        const alreadyExists = ['42P07', '42701', '42710'].includes(err.code);
        if (alreadyExists) {
          console.warn(`  (schema já existe, marcando como aplicada) ${file}`);
          await client.query(
            'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
            [file]
          );
        } else {
          console.error(`✗ ${file}: ${err.message}`);
          process.exit(1);
        }
      }
    }

    console.log('Migrations complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
