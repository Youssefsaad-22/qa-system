import { query } from '../src/config/db.js';

const MAPPING = {
  'John Smith': { account: 'Acme Corp', lobs: ['Customer Support', 'Technical Support'] },
  'Jane Doe': { account: 'Acme Corp', lobs: ['Sales', 'Customer Support'] },
  'Mike Johnson': { account: 'Beta Inc', lobs: ['Sales', 'Technical Support'] },
  'Sarah Wilson': { account: 'Beta Inc', lobs: ['Technical Support', 'Customer Support'] },
  'David Brown': { account: 'Gamma LLC', lobs: ['Sales', 'Customer Support'] },
  'Emily Davis': { account: 'Gamma LLC', lobs: ['Technical Support', 'Sales'] },
  'Robert Taylor': { account: 'Acme Corp', lobs: ['Customer Support'] },
  'Chris Anderson': { account: 'Beta Inc', lobs: ['Sales', 'Technical Support'] },
  'Lisa Martinez': { account: 'Gamma LLC', lobs: ['Customer Support', 'Sales'] },
};

const run = async () => {
  const result = await query(
    `SELECT call_id, agent_name, line_of_business FROM calls`
  );

  let updated = 0;
  for (const call of result.rows) {
    const mapping = MAPPING[call.agent_name];
    if (!mapping) continue;
    const newLob = mapping.lobs.includes(call.line_of_business)
      ? call.line_of_business
      : mapping.lobs[0];
    await query(
      `UPDATE calls SET account_name = $1, line_of_business = $2 WHERE call_id = $3`,
      [mapping.account, newLob, call.call_id]
    );
    updated += 1;
  }

  console.log(`Aligned ${updated} calls to agent<->account/enity mapping`);
  process.exit(0);
};

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});