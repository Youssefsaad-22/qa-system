import { query, getClient } from '../config/db.js';
import { extractCallMeta } from '../utils/callMeta.js';
import { sendReviewToDirectus, isReviewsSyncConfigured } from '../sync/directusReviews.js';

const DEFAULT_SAMPLE_LIMIT = 2;

async function getSamplingConfig(client) {
  const result = await client.query(
    `SELECT key, value FROM settings WHERE key IN ('sample_limit', 'skip_daily_limit')`
  );

  const config = { limit: DEFAULT_SAMPLE_LIMIT, skipDailyLimit: 5 };
  for (const row of result.rows) {
    const parsed = parseInt(row.value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) continue;
    if (row.key === 'sample_limit') config.limit = parsed;
    if (row.key === 'skip_daily_limit') config.skipDailyLimit = parsed;
  }
  return config;
}

async function countSkipsToday(client, userId) {
  const result = await client.query(
    `SELECT COUNT(*) AS cnt FROM call_skips
     WHERE qa_worker_id = $1 AND created_at >= date_trunc('day', NOW())`,
    [userId]
  );
  return Number(result.rows[0].cnt);
}

async function countSampledAgentsToday(client, userId, agentId) {
  const result = await client.query(
    `SELECT 1 FROM sample_logs sl
     JOIN calls c ON c.call_id = sl.call_id
     WHERE sl.user_id = $1
       AND c.agent_id = $2
       AND sl.created_at >= date_trunc('day', NOW())
     LIMIT 1`,
    [userId, agentId]
  );
  return result.rows.length > 0;
}

async function logSample(client, userId, callId, kind) {
  await client.query(
    `INSERT INTO sample_logs (user_id, call_id, kind) VALUES ($1, $2, $3)`,
    [userId, callId, kind]
  );
}

export const getAgents = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await query(
      `SELECT c.agent_id, MIN(c.agent_name) AS agent_name, COUNT(*)::int AS unreviewed
       FROM calls c
       WHERE c.agent_id IS NOT NULL
         AND c.status = 'UNASSIGNED'
         AND NOT EXISTS (
           SELECT 1 FROM sample_logs sl
           JOIN calls sc ON sc.call_id = sl.call_id
           WHERE sl.user_id = $1
             AND sl.created_at >= date_trunc('day', NOW())
             AND sc.agent_id = c.agent_id
         )
       GROUP BY c.agent_id
       ORDER BY c.agent_id`,
      [userId]
    );

    res.json({ agents: result.rows });
  } catch (error) {
    console.error('Get agents error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const sampleCall = async (req, res) => {
  const client = await getClient();
  
  try {
    const { agent_id } = req.body;
    const userId = req.user.userId;

    if (!agent_id) {
      return res.status(400).json({ error: 'Agent ID is required' });
    }

    await client.query('BEGIN');

    const config = await getSamplingConfig(client);

    // Each agent can only be sampled once per day per QA worker
    const alreadySampled = await countSampledAgentsToday(client, userId, agent_id);
    if (alreadySampled) {
      await client.query('ROLLBACK');
      return res.status(429).json({
        error: 'This agent has already been sampled today. Each agent can only be sampled once per day.',
      });
    }

    // Atomic selection of the batch with FOR UPDATE SKIP LOCKED
    const selectQuery = `
      SELECT call_id, external_system_call_id, agent_id, agent_name, call_timestamp
      FROM calls
      WHERE agent_id = $1
        AND status = 'UNASSIGNED'
      ORDER BY RANDOM()
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    `;

    const selectResult = await client.query(selectQuery, [agent_id, config.limit]);

    if (selectResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        error: 'No available calls found for this agent',
        calls: [] 
      });
    }

    const assigned = [];
    for (const call of selectResult.rows) {
      const updateQuery = `
        UPDATE calls 
        SET status = 'ASSIGNED', assigned_to_user_id = $1, assigned_at = NOW()
        WHERE call_id = $2
      `;
      await client.query(updateQuery, [userId, call.call_id]);

      await logSample(client, userId, call.call_id, 'SAMPLE');

      assigned.push({
        ...call,
        status: 'ASSIGNED',
        assigned_to_user_id: userId,
        assigned_at: new Date()
      });
    }

    await client.query('COMMIT');

    res.json({
      calls: assigned,
      count: assigned.length,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sample call error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

export const completeCall = async (req, res) => {
  try {
    const { call_id } = req.body;
    const userId = req.user.userId;

    if (!call_id) {
      return res.status(400).json({ error: 'Call ID is required' });
    }

    const result = await query(
      `UPDATE calls 
       SET status = 'COMPLETED' 
       WHERE call_id = $1 AND assigned_to_user_id = $2 AND status = 'ASSIGNED'
       RETURNING *`,
      [call_id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found or not assigned to you' });
    }

    const call = result.rows[0];
    const directus = await syncCompletedReviewToDirectus(call, userId);

    res.json({ message: 'Call marked as completed', call, directus });
  } catch (error) {
    console.error('Complete call error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

async function syncCompletedReviewToDirectus(call, userId) {
  if (!isReviewsSyncConfigured()) {
    return { sent: false, reason: 'not configured' };
  }

  const meta = extractCallMeta(call);

  let qaWorker = '';
  try {
    const userResult = await query(`SELECT username FROM users WHERE user_id = $1`, [userId]);
    qaWorker = userResult.rows[0]?.username || '';
  } catch {
    qaWorker = '';
  }

  const payload = {
    external_call_id: call.external_system_call_id,
    agent_id: call.agent_id,
    agent_name: call.agent_name || '',
    call_date: meta.call_date,
    call_duration: meta.call_duration,
    call_number: meta.call_number,
    qa_worker: qaWorker,
    reviewed_at: new Date().toISOString(),
  };

  try {
    const item = await sendReviewToDirectus(payload);
    await query(
      `UPDATE calls SET directus_sent_at = NOW(), directus_send_error = NULL WHERE call_id = $1`,
      [call.call_id]
    );
    return { sent: true, item };
  } catch (error) {
    console.error('Directus review sync failed:', error.message);
    await query(
      `UPDATE calls SET directus_send_error = $1 WHERE call_id = $2`,
      [String(error.message).slice(0, 500), call.call_id]
    );
    return { sent: false, reason: error.message };
  }
}

export const skipCall = async (req, res) => {
  const client = await getClient();
  
  try {
    const { call_id, justification_reason } = req.body;
    const userId = req.user.userId;

    if (!call_id || !justification_reason) {
      return res.status(400).json({ error: 'Call ID and justification reason are required' });
    }

    await client.query('BEGIN');

    // Verify the call is assigned to this user
    const callCheck = await client.query(
      `SELECT * FROM calls WHERE call_id = $1 AND assigned_to_user_id = $2 AND status = 'ASSIGNED'`,
      [call_id, userId]
    );

    if (callCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Call not found or not assigned to you' });
    }

    const config = await getSamplingConfig(client);
    const skipsToday = await countSkipsToday(client, userId);
    if (skipsToday >= config.skipDailyLimit) {
      await client.query('ROLLBACK');
      return res.status(429).json({
        error: `Daily skip limit reached: ${config.skipDailyLimit} skips per day. Please try again tomorrow.`,
        skipDailyLimit: config.skipDailyLimit,
      });
    }

    // Insert skip record
    const skipResult = await client.query(
      `INSERT INTO call_skips (call_id, qa_worker_id, justification_reason)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [call_id, userId, justification_reason]
    );

    // Update call status to PENDING_APPROVAL
    await client.query(
      `UPDATE calls SET status = 'PENDING_APPROVAL' WHERE call_id = $1`,
      [call_id]
    );

    await client.query('COMMIT');

    // Auto-assign a replacement call using the same agent; it also counts as this agent's sample
    const originalCall = callCheck.rows[0];
    const replacementCall = await sampleCallInternal(
      client,
      originalCall.agent_id,
      userId
    );
    if (replacementCall) {
      await logSample(client, userId, replacementCall.call_id, 'SKIP_REPLACEMENT');
    }

    res.json({
      message: 'Call skipped, awaiting supervisor approval',
      skip: skipResult.rows[0],
      replacementCall: replacementCall,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Skip call error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

// Internal function to sample a call within an existing transaction
async function sampleCallInternal(client, agentId, userId) {
  const selectQuery = `
    SELECT call_id, external_system_call_id, agent_id, agent_name, call_timestamp
    FROM calls
    WHERE agent_id = $1
      AND status = 'UNASSIGNED'
    ORDER BY RANDOM()
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `;

  const selectResult = await client.query(selectQuery, [agentId]);

  if (selectResult.rows.length === 0) {
    return null;
  }

  const call = selectResult.rows[0];

  await client.query(
    `UPDATE calls SET status = 'ASSIGNED', assigned_to_user_id = $1, assigned_at = NOW() WHERE call_id = $2`,
    [userId, call.call_id]
  );

  return {
    ...call,
    status: 'ASSIGNED',
    assigned_to_user_id: userId,
    assigned_at: new Date()
  };
}

export const getAssignedCalls = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await query(
      `SELECT call_id, external_system_call_id, agent_id, agent_name, call_timestamp, status, assigned_at
       FROM calls
       WHERE assigned_to_user_id = $1 AND status IN ('ASSIGNED', 'PENDING_APPROVAL')
       ORDER BY assigned_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get assigned calls error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getCallHistory = async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await query(
      `SELECT c.call_id, c.external_system_call_id, c.agent_id, c.agent_name,
              c.call_timestamp, c.status, c.assigned_at,
              cs.skip_id, cs.approval_status, cs.justification_reason
       FROM calls c
       LEFT JOIN call_skips cs ON cs.call_id = c.call_id
       WHERE c.assigned_to_user_id = $1
          OR EXISTS (SELECT 1 FROM call_skips cs2 WHERE cs2.call_id = c.call_id AND cs2.qa_worker_id = $1)
       ORDER BY c.call_timestamp DESC
       LIMIT 200`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get call history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};