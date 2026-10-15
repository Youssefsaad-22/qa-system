import bcrypt from 'bcryptjs';
import { query } from '../src/config/db.js';

const SEED_USERS = [
  { username: 'qa_worker_1', password: 'QaWorker1!pass', role: 'QA_WORKER' },
  { username: 'qa_worker_2', password: 'QaWorker2!pass', role: 'QA_WORKER' },
  { username: 'supervisor_1', password: 'Supervisor1!pass', role: 'SUPERVISOR' },
];

const run = async () => {
  for (const user of SEED_USERS) {
    const hash = await bcrypt.hash(user.password, 10);
    const result = await query(
      'UPDATE users SET password_hash = $1 WHERE username = $2 RETURNING user_id, username, role',
      [hash, user.username]
    );
    if (result.rows.length === 0) {
      console.log(`SKIP ${user.username} (not found)`);
    } else {
      console.log(`RESET ${user.username} (${user.role}) -> ${user.password}`);
    }
  }
  process.exit(0);
};

run().catch((err) => {
  console.error('Seed password reset failed:', err);
  process.exit(1);
});