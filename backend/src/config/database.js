'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error', err);
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

async function initDatabase() {
  const fs = require('fs');
  const path = require('path');
  const migrationPath = path.join(__dirname, '../db/migrations/001_init.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  try {
    await pool.query(sql);
  } catch (err) {
    // Ignora erros de "já existe" em re-execuções
    if (!err.message.includes('already exists')) throw err;
  }
}

module.exports = { query, pool, initDatabase };
