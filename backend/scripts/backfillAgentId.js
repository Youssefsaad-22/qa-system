import { getClient } from '../src/config/db.js';

const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

function makeByHeader(columns, leg) {
  const map = new Map();
  columns.forEach((h, i) => {
    map.set(norm(h), leg[String(h || '')] ?? leg[i] ?? '');
  });
  return (name) => String(map.get(norm(name)) ?? '').trim();
}

function extractAgent(columns, legs) {
  const isAnsweredLeg = (r) => {
    const by = makeByHeader(columns, r);
    const disp = (by('Disposition') || '').toUpperCase();
    return disp.includes('ANSWER') || by('Answered') === '1';
  };

  const looksLikePerson = (s) => /\s/.test(s) && !/[_\-]/.test(s);

  let personLeg = null;
  let memberAnsweredNumber = '';
  let memberAnsweredName = '';
  let firstAnsweredDst = '';

  for (const r of legs) {
    const by = makeByHeader(columns, r);
    const man = by('Member Answered Number');
    if (man && !memberAnsweredNumber) memberAnsweredNumber = man;
    const maname = by('Member Answered Name');
    if (maname && !memberAnsweredName) memberAnsweredName = maname;

    if (isAnsweredLeg(r)) {
      const dst = by('Dst');
      const prefix = by('Dstnameprefix');
      const dstname = by('Dstname');
      if (!firstAnsweredDst && dst) firstAnsweredDst = dst;
      if (!personLeg && dst && !prefix && dstname && looksLikePerson(dstname)) {
        personLeg = { dst, dstname };
      }
    }
  }

  const agentId = (personLeg && personLeg.dst) || memberAnsweredNumber || firstAnsweredDst;
  const agentName = (personLeg && personLeg.dstname) || memberAnsweredName || '';
  return { agentId: agentId ? String(agentId) : null, agentName };
}

const run = async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const mockPurged = await client.query(
      `DELETE FROM sample_logs WHERE call_id IN (
         SELECT call_id FROM calls WHERE source_system = 'mock' OR external_system_call_id LIKE 'MOCK-%'
       )`
    );
    const skipsPurged = await client.query(
      `DELETE FROM call_skips WHERE call_id IN (
         SELECT call_id FROM calls WHERE source_system = 'mock' OR external_system_call_id LIKE 'MOCK-%'
       )`
    );
    const callsPurged = await client.query(
      `DELETE FROM calls WHERE source_system = 'mock' OR external_system_call_id LIKE 'MOCK-%'`
    );

    const rows = await client.query(
      `SELECT call_id, agent_id, agent_name, raw_data
       FROM calls
       WHERE raw_data IS NOT NULL
         AND raw_data ? 'legs'`
    );

    let updated = 0;
    let skipped = 0;
    for (const row of rows.rows) {
      const { columns, legs } = row.raw_data || {};
      if (!Array.isArray(columns) || !Array.isArray(legs) || legs.length === 0) {
        skipped += 1;
        continue;
      }

      const { agentId, agentName } = extractAgent(columns, legs);
      if (!agentId) {
        skipped += 1;
        continue;
      }

      if (String(row.agent_id || '') === agentId && (row.agent_name || '') === agentName) {
        continue;
      }

      await client.query(
        `UPDATE calls SET agent_id = $1, agent_name = $2 WHERE call_id = $3`,
        [agentId, agentName, row.call_id]
      );
      updated += 1;
    }

    await client.query('COMMIT');
    console.log(`Purged mock rows: ${callsPurged.rowCount} calls, ${skipsPurged.rowCount} skips, ${mockPurged.rowCount} sample logs`);
    console.log(`Backfilled agent_id: ${updated} updated, ${skipped} skipped (no agent leg)`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
  }
};

run()
  .then(() => process.exit(process.exitCode || 0))
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
