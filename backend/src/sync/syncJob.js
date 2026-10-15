import { loadConfiguredProviders } from './registry.js';

let timers = [];
let started = false;

export const startSyncJob = () => {
  if (started) {
    console.log('Sync job already running');
    return;
  }

  const providers = loadConfiguredProviders();
  if (providers.length === 0) {
    console.log('Sync job: no providers configured (set SYNC_PROVIDERS and related SYNC_*_ vars)');
    return;
  }

  started = true;

  providers.forEach((provider, index) => {
    const run = async () => {
      try {
        const inserted = await provider.sync();
        if (inserted > 0) {
          console.log(`Sync (${provider.name}): inserted ${inserted} new calls`);
        }
      } catch (error) {
        console.error(`Sync error (${provider.name}):`, error.message);
      }
    };

    setTimeout(run, index * 5000);
    const timer = setInterval(run, provider.interval);
    timers.push(timer);

    console.log(
      `Sync (${provider.name}): scheduled every ${Math.round(provider.interval / 1000)}s`
    );
  });
};

export const stopSyncJob = () => {
  timers.forEach(clearInterval);
  timers = [];
  started = false;
  console.log('Sync job stopped');
};