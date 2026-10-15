import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDatabase() {
  const schemaPath = path.join(__dirname, '../../migrations/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  try {
    console.log('Initializing database...');
    await pool.query(schema);
    console.log('Database initialized successfully!');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

initDatabase().catch(console.error);