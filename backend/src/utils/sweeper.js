import { query } from '../config/db.js';

const SWEEPER_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const ASSIGNMENT_TIMEOUT_MINUTES = 30;

let sweeperInterval = null;

export const startSweeper = () => {
  if (sweeperInterval) {
    console.log('Sweeper already running');
    return;
  }

  console.log('Starting abandoned call sweeper (runs every 5 minutes)...');
  
  sweeperInterval = setInterval(async () => {
    try {
      await sweepAbandonedCalls();
    } catch (error) {
      console.error('Sweeper error:', error);
    }
  }, SWEEPER_INTERVAL_MS);

  // Run immediately on startup
  sweepAbandonedCalls().catch(console.error);
};

export const stopSweeper = () => {
  if (sweeperInterval) {
    clearInterval(sweeperInterval);
    sweeperInterval = null;
    console.log('Sweeper stopped');
  }
};

async function sweepAbandonedCalls() {
  const result = await query(
    `UPDATE calls 
     SET status = 'UNASSIGNED', assigned_to_user_id = NULL, assigned_at = NULL
     WHERE status = 'ASSIGNED' 
       AND assigned_at < NOW() - INTERVAL '${ASSIGNMENT_TIMEOUT_MINUTES} minutes'
     RETURNING call_id, external_system_call_id`
  );

  if (result.rowCount > 0) {
    console.log(`Sweeper: Released ${result.rowCount} abandoned calls`);
    result.rows.forEach(call => {
      console.log(`  - Call ${call.call_id} (${call.external_system_call_id}) returned to pool`);
    });
  }
}