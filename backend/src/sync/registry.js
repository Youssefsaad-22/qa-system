import YeastarAdapter from './providers/yeastar.js';
import MockAdapter from './providers/mock.js';

const registry = new Map();

export function registerProvider(name, AdapterClass) {
  registry.set(name, AdapterClass);
}

export function getAdapterClass(name) {
  return registry.get(name);
}

function envKey(name, suffix) {
  return `SYNC_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${suffix}`;
}

export function loadConfiguredProviders() {
  const enabled = (process.env.SYNC_PROVIDERS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return enabled.flatMap((name) => {
    const AdapterClass = registry.get(name);
    if (!AdapterClass) {
      console.warn(`Sync: unknown provider "${name}" in SYNC_PROVIDERS, skipping`);
      return [];
    }

    const config = {
      baseUrl: process.env[envKey(name, 'BASE_URL')] || '',
      apiKey: process.env[envKey(name, 'API_KEY')] || undefined,
      username: process.env[envKey(name, 'USERNAME')] || undefined,
      password: process.env[envKey(name, 'PASSWORD')] || undefined,
      interval: Number(process.env[envKey(name, 'INTERVAL_MS')]) || 5 * 60 * 1000,
      batchSize: Number(process.env[envKey(name, 'BATCH_SIZE')]) || 0,
      csvFile: process.env[envKey(name, 'CSV_FILE')] || '',
      csvDir: process.env[envKey(name, 'CSV_DIR')] || '',
    };

    const provider = new AdapterClass(config);

    if (provider.requiresBaseUrl && !provider.config.baseUrl) {
      console.warn(`Sync: no base URL configured for provider "${name}", skipping`);
      return [];
    }

    if (provider.needsExternalSource && !provider.config.csvDir && !provider.config.csvFile && !provider.config.baseUrl) {
      console.warn(`Sync: no CSV or API source configured for provider "${name}", skipping`);
      return [];
    }

    if (provider.requiresBaseUrl) {
      if (
        !provider.supportsAnonymous &&
        !provider.config.apiKey &&
        !(provider.config.username && provider.config.password)
      ) {
        console.warn(`Sync: no API key or credentials configured for provider "${name}"`);
      }
    }

    return [provider];
  });
}

registerProvider('yeastar', YeastarAdapter);
registerProvider('mock', MockAdapter);