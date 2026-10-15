import { query, getClient } from '../config/db.js';

export const getPendingSkips = async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        cs.skip_id,
        cs.call_id,
        cs.qa_worker_id,
        cs.justification_reason,
        cs.created_at as skip_created_at,
        c.external_system_call_id,
        c.agent_id,
        c.agent_name,
        u.username as qa_worker_name
       FROM call_skips cs
       JOIN calls c ON cs.call_id = c.call_id
       JOIN users u ON cs.qa_worker_id = u.user_id
       WHERE cs.approval_status = 'PENDING'
       ORDER BY cs.created_at ASC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get pending skips error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const resolveSkip = async (req, res) => {
  const client = await getClient();
  
  try {
    const { skip_id, action, notes } = req.body;
    const supervisorId = req.user.userId;

    if (!skip_id || !action) {
      return res.status(400).json({ error: 'Skip ID and action are required' });
    }

    if (!['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).json({ error: 'Action must be APPROVE or REJECT' });
    }

    await client.query('BEGIN');

    // Get the skip record with call info
    const skipResult = await client.query(
      `SELECT cs.*, c.status as call_status
       FROM call_skips cs
       JOIN calls c ON cs.call_id = c.call_id
       WHERE cs.skip_id = $1 AND cs.approval_status = 'PENDING'
       FOR UPDATE`,
      [skip_id]
    );

    if (skipResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pending skip not found' });
    }

    const skip = skipResult.rows[0];

    if (action === 'APPROVE') {
      // Update skip record
      await client.query(
        `UPDATE call_skips 
         SET approval_status = 'APPROVED', supervisor_id = $1, supervisor_notes = $2, resolved_at = NOW()
         WHERE skip_id = $3`,
        [supervisorId, notes || null, skip_id]
      );

      // Update call status to DISCARDED
      await client.query(
        `UPDATE calls SET status = 'DISCARDED', assigned_to_user_id = NULL, assigned_at = NULL WHERE call_id = $1`,
        [skip.call_id]
      );
    } else {
      // REJECT - keep the call out of the QA pool; handles in-company
      await client.query(
        `UPDATE call_skips 
         SET approval_status = 'REJECTED', supervisor_id = $1, supervisor_notes = $2, resolved_at = NOW()
         WHERE skip_id = $3`,
        [supervisorId, notes || null, skip_id]
      );

      await client.query(
        `UPDATE calls SET status = 'REJECTED', assigned_to_user_id = NULL, assigned_at = NULL WHERE call_id = $1`,
        [skip.call_id]
      );
    }

    await client.query('COMMIT');

    res.json({ 
      message: `Skip ${action.toLowerCase()}d successfully`,
      action,
      skipId: skip_id
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Resolve skip error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

const STANDARD_CALL_COLUMNS = [
  'external_system_call_id',
  'agent_id',
  'agent_name',
  'call_timestamp',
  'status',
  'assigned_to',
  'assigned_at',
  'justification_reason',
];

const pickDisplayLeg = (raw) => {
  const legs = raw && Array.isArray(raw.legs) ? raw.legs : null;
  if (!legs || legs.length === 0) return null;
  const answered = legs.filter(
    (l) => String(l.Answered) === '1' || /answer/i.test(String(l.Disposition || ''))
  );
  return (
    answered.find((l) => String(l['Member Answered Name'] || '').trim() !== '') ||
    answered[0] ||
    legs[0]
  );
};

const cellValue = (v) => (v instanceof Date ? v.toISOString() : v);

export const getAllCalls = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.page_size, 10) || 100));
    const offset = (page - 1) * pageSize;

    const requestedSource = String(req.query.source || '').trim().toLowerCase();
    const filteringSource = requestedSource !== '' && requestedSource !== 'all';

    const params = [];
    let where = '';
    if (filteringSource) {
      where = 'WHERE c.source_system = $1';
      params.push(requestedSource);
    }

    const countResult = await query(
      `SELECT COUNT(*)::int AS total FROM calls c ${where}`,
      params
    );

    const result = await query(
      `SELECT c.call_id, c.external_system_call_id, c.agent_id, c.agent_name,
              c.call_timestamp, c.status, c.assigned_at, c.source_system, c.raw_data,
              u.username as assigned_to,
              cs.skip_id, cs.approval_status, cs.justification_reason
       FROM calls c
       LEFT JOIN users u ON c.assigned_to_user_id = u.user_id
       LEFT JOIN call_skips cs ON cs.call_id = c.call_id
       ${where} ORDER BY c.call_timestamp DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    const sourcesResult = await query(
      `SELECT DISTINCT source_system FROM calls
       WHERE source_system IS NOT NULL AND source_system <> '' AND source_system <> 'unknown'
       ORDER BY source_system`
    );
    const sources = sourcesResult.rows.map((r) => r.source_system);

    let columns = STANDARD_CALL_COLUMNS;
    let calls = result.rows;

    if (filteringSource) {
      const firstRaw = calls.find((c) => c.raw_data)?.raw_data;
      const firstHeader = firstRaw && Array.isArray(firstRaw.columns)
        ? firstRaw.columns.filter((h) => String(h || '').trim() !== '')
        : null;
      if (firstHeader && firstHeader.length > 0) {
        columns = firstHeader;
      } else {
        const firstLeg = pickDisplayLeg(firstRaw);
        if (firstLeg && Object.keys(firstLeg).length > 0) {
          columns = Object.keys(firstLeg);
        }
      }
      calls = result.rows.map((call) => {
        const leg = pickDisplayLeg(call.raw_data);
        const row = { call_id: call.call_id, source_system: call.source_system };
        for (const col of columns) {
          row[col] = cellValue(leg && col in leg ? leg[col] : call[col] ?? '');
        }
        return row;
      });
    }

    res.json({
      calls,
      columns,
      source: filteringSource ? requestedSource : 'all',
      sources,
      page,
      page_size: pageSize,
      total: countResult.rows[0].total,
      total_pages: Math.ceil(countResult.rows[0].total / pageSize),
    });
  } catch (error) {
    console.error('Get all calls error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getWorkerRecords = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.page_size, 10) || 50));
    const offset = (page - 1) * pageSize;

    const countResult = await query(
      `SELECT COUNT(*)::int AS total FROM calls
       WHERE status IN ('COMPLETED', 'REJECTED', 'DISCARDED')`
    );

    const result = await query(
      `SELECT c.call_id, c.external_system_call_id, c.agent_id, c.agent_name,
              c.call_timestamp, c.status, c.assigned_at,
              COALESCE(au.username, sw.username) AS qa_worker_name,
              cs.justification_reason, cs.approval_status, cs.supervisor_notes, cs.resolved_at
       FROM calls c
       LEFT JOIN users au ON c.assigned_to_user_id = au.user_id
       LEFT JOIN call_skips cs ON cs.call_id = c.call_id
       LEFT JOIN users sw ON cs.qa_worker_id = sw.user_id
       WHERE c.status IN ('COMPLETED', 'REJECTED', 'DISCARDED')
       ORDER BY c.call_timestamp DESC
       LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    res.json({
      records: result.rows,
      page,
      page_size: pageSize,
      total: countResult.rows[0].total,
      total_pages: Math.ceil(countResult.rows[0].total / pageSize),
    });
  } catch (error) {
    console.error('Get worker records error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getWorkerSummary = async (req, res) => {
  try {
    const result = await query(
      `SELECT COALESCE(au.username, sw.username, 'Unassigned') AS qa_worker_name,
              COUNT(*) FILTER (WHERE c.status = 'COMPLETED')::int AS completed,
              COUNT(*) FILTER (WHERE c.status = 'REJECTED')::int AS rejected,
              COUNT(*) FILTER (WHERE c.status = 'DISCARDED')::int AS discarded
       FROM calls c
       LEFT JOIN users au ON c.assigned_to_user_id = au.user_id
       LEFT JOIN call_skips cs ON cs.call_id = c.call_id
       LEFT JOIN users sw ON cs.qa_worker_id = sw.user_id
       WHERE c.status IN ('COMPLETED', 'REJECTED', 'DISCARDED')
       GROUP BY 1
       ORDER BY 1`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get worker summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getSamplingConfig = async (req, res) => {
  try {
    const result = await query(
      `SELECT key, value FROM settings WHERE key IN ('sample_limit', 'skip_daily_limit')`
    );

    const config = { sample_limit: 3, skip_daily_limit: 5 };
    for (const row of result.rows) {
      const parsed = parseInt(row.value, 10);
      if (Number.isFinite(parsed) && parsed > 0) config[row.key] = parsed;
    }

    res.json(config);
  } catch (error) {
    console.error('Get sampling config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateSamplingConfig = async (req, res) => {
  try {
    const limit = Math.floor(Number(req.body.sample_limit));
    const skipDailyLimit = Math.floor(Number(req.body.skip_daily_limit));

    if (!Number.isFinite(limit) || limit < 1 || limit > 1000) {
      return res.status(400).json({ error: 'sample_limit must be between 1 and 1000' });
    }
    if (!Number.isFinite(skipDailyLimit) || skipDailyLimit < 1 || skipDailyLimit > 1000) {
      return res.status(400).json({ error: 'skip_daily_limit must be between 1 and 1000' });
    }

    await query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('sample_limit', $1, NOW()), ('skip_daily_limit', $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [String(limit), String(skipDailyLimit)]
    );

    res.json({ sample_limit: limit, skip_daily_limit: skipDailyLimit });
  } catch (error) {
    console.error('Update sampling config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getSupervisorStats = async (req, res) => {
  try {
    const stats = await query(
      `SELECT 
        COUNT(*) FILTER (WHERE cs.approval_status = 'PENDING') as pending,
        COUNT(*) FILTER (WHERE cs.approval_status = 'APPROVED') as approved,
        COUNT(*) FILTER (WHERE cs.approval_status = 'REJECTED') as rejected
       FROM call_skips cs`
    );

    const callStats = await query(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'UNASSIGNED') as unassigned,
        COUNT(*) FILTER (WHERE status = 'ASSIGNED') as assigned,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
        COUNT(*) FILTER (WHERE status = 'PENDING_APPROVAL') as pending_approval,
        COUNT(*) FILTER (WHERE status = 'DISCARDED') as discarded
       FROM calls`
    );

    res.json({
      skips: stats.rows[0],
      calls: callStats.rows[0]
    });
  } catch (error) {
    console.error('Get supervisor stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};