import { loadConfiguredProviders } from './registry.js';

async function runOnce() {
  const providers = loadConfiguredProviders();
  if (providers.length === 0) {
    console.log('No providers configured. Set SYNC_PROVIDERS (e.g. mock).');
    process.exit(0);
  }

  for (const provider of providers) {
    try {
      const inserted = await provider.sync();
      console.log(`Sync (${provider.name}): inserted ${inserted} new calls`);
    } catch (error) {
      console.error(`Sync error (${provider.name}):`, error.message);
    }
  }

  process.exit(0);
}

runOnce();