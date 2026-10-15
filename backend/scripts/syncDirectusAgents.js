import { getDirectusAgents, isDirectusConfigured, getDirectusConfig } from '../src/sync/directusAgents.js';

const run = async () => {
  const cfg = getDirectusConfig();
  if (!cfg.baseUrl) {
    console.log('Directus agent sync: not configured.');
    console.log('Set DIRECTUS_BASE_URL and either DIRECTUS_TOKEN or DIRECTUS_USERNAME + DIRECTUS_PASSWORD in backend/.env');
    console.log('Defaults: collection=directus_users, name from first_name+last_name, account field=account_name, LOB field=lobs.');
    console.log('Override collection/fields with DIRECTUS_COLLECTION / DIRECTUS_NAME_FIELD / DIRECTUS_ACCOUNT_FIELD / DIRECTUS_LOB_FIELD.');
    process.exit(0);
  }

  console.log(`Directus configured: ${isDirectusConfigured()}`);
  console.log(`  base URL:   ${cfg.baseUrl}`);
  console.log(`  collection: ${cfg.collection}`);
  console.log(`  token set:  ${Boolean(cfg.token)}`);
  console.log(`  creds set:  ${Boolean(cfg.username && cfg.password)}`);
  console.log(`  name field: ${cfg.nameField || 'first_name + last_name'}`);
  console.log(`  account:    ${cfg.accountField}`);
  console.log(`  LOB:        ${cfg.lobField}`);
  console.log('');

  const agents = await getDirectusAgents();
  console.log(`Fetched ${agents.length} agents from Directus`);
  for (const agent of agents.slice(0, 10)) {
    console.log(`  ${agent.name} | ${agent.account_name} | ${agent.lobs.join(', ')}`);
  }
  if (agents.length > 10) console.log(`  ... and ${agents.length - 10} more`);
  process.exit(0);
};

run().catch((err) => {
  console.error('Directus agent sync failed:', err.message);
  process.exit(1);
});