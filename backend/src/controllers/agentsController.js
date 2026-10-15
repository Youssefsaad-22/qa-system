import { query } from '../config/db.js';

export const listAgents = async (req, res) => {
  try {
    const { q } = req.query;
    const search = (q || '').trim();

    const result = await query(
      `SELECT
         agent_id,
         MIN(agent_name) AS agent_name,
         COUNT(*) AS total_calls,
         MAX(call_timestamp) AS last_call
       FROM calls
       WHERE agent_id IS NOT NULL
         AND ($1 = '' OR agent_id ILIKE '%' || $1 || '%' OR agent_name ILIKE '%' || $1 || '%')
       GROUP BY agent_id
       ORDER BY agent_id`,
      [search]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('List agents error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};