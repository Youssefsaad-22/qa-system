import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const INACTIVE_STATUSES = new Set(['inactive', 'disabled', 'suspended', 'invited', 'archived']);

const readEnvFile = () => {
  const envFile = path.resolve(process.cwd(), '.env');
  try {
    return dotenv.parse(fs.readFileSync(envFile));
  } catch {
    return {};
  }
};

const env = (name, fallback = '') => {
  const file = readEnvFile();
  const value = file[name] ?? process.env[name];
  return value !== undefined && value !== '' ? value : fallback;
};

export const getDirectusConfig = () => {
  const baseUrl = env('DIRECTUS_BASE_URL', env('SYNC_IMS_BASE_URL', '')).replace(/\/+$/, '');
  return {
    baseUrl,
    token: env('DIRECTUS_TOKEN', env('SYNC_IMS_API_KEY', '')),
    username: env('DIRECTUS_USERNAME', env('SYNC_IMS_USERNAME', '')),
    password: env('DIRECTUS_PASSWORD', env('SYNC_IMS_PASSWORD', '')),
    collection: env('DIRECTUS_COLLECTION', 'directus_users'),
    reviewsCollection: env('DIRECTUS_REVIEWS_COLLECTION', 'qa_reviews'),
    reviewsFlowId: env('DIRECTUS_REVIEWS_FLOW_ID', ''),
    reviewsFlowUrl: env('DIRECTUS_REVIEWS_FLOW_URL', ''),
    reviewsFlowMethod: env('DIRECTUS_REVIEWS_FLOW_METHOD', 'POST').toUpperCase(),
    nameField: env('DIRECTUS_NAME_FIELD', ''),
    accountField: env('DIRECTUS_ACCOUNT_FIELD', 'account_name'),
    lobField: env('DIRECTUS_LOB_FIELD', 'lobs'),
    defaultAccount: env('DIRECTUS_DEFAULT_ACCOUNT', 'Unknown'),
    defaultLobs: env('DIRECTUS_DEFAULT_LOB', 'General')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    excludedEmails: env('DIRECTUS_EXCLUDE_EMAILS', '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    excludeRoles: env('DIRECTUS_EXCLUDE_ROLES', 'Administrator')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    cacheTtlMs: Math.max(Number(env('DIRECTUS_CACHE_TTL_MS', '60000')) || 60000, 1000),
    pollIntervalMs: Math.max(Number(env('DIRECTUS_POLL_INTERVAL_MS', '60000')) || 60000, 5000),
  };
};

const firstValue = (value) => {
  if (value == null) return '';
  if (Array.isArray(value)) return value[0] == null ? '' : value[0];
  if (typeof value === 'object') return value.name || value.value || '';
  return String(value).trim();
};

const toLobList = (value) => {
  if (value == null) return [];
  const raw = Array.isArray(value) ? value : [value];
  const list = raw
    .map((item) => {
      if (item == null) return null;
      if (typeof item === 'object') return item.name || item.value || null;
      return String(item).trim();
    })
    .filter(Boolean);
  const expanded = [];
  for (const item of list) {
    if (item.includes(',')) {
      expanded.push(...item.split(',').map((s) => s.trim()).filter(Boolean));
    } else {
      expanded.push(item);
    }
  }
  return [...new Set(expanded)];
};

const configFingerprint = (config) =>
  [config.baseUrl, config.collection, config.token, config.username, config.password].join('|');

let token = null;
let cache = null;
let lastFingerprint = null;

const ensureFreshContext = () => {
  const cfg = getDirectusConfig();
  const fp = configFingerprint(cfg);
  if (fp !== lastFingerprint) {
    lastFingerprint = fp;
    token = null;
    cache = null;
  }
  return cfg;
};

const normalizeAgent = (raw, roleName = '') => {
  if (!raw || typeof raw !== 'object') return null;

  const cfg = getDirectusConfig();
  const email = String(raw.email || '').toLowerCase();
  if (cfg.username && email === cfg.username.toLowerCase()) return null;
  if (cfg.excludedEmails.includes(email)) return null;

  const rn = roleName.toLowerCase();
  if (rn && cfg.excludeRoles.includes(rn)) return null;

  const status = String(raw.status || '').toLowerCase();
  if (status && INACTIVE_STATUSES.has(status)) return null;

  let name;
  if (cfg.nameField) {
    name = firstValue(raw[cfg.nameField]);
  } else {
    name = [firstValue(raw.first_name), firstValue(raw.last_name)].filter(Boolean).join(' ').trim();
    if (!name) name = firstValue(raw.email) || firstValue(raw.username) || String(raw.id || '');
  }
  if (!name) return null;

  const account = firstValue(raw[cfg.accountField]) || cfg.defaultAccount;
  let lobs = toLobList(raw[cfg.lobField]);
  if (lobs.length === 0) lobs = [...cfg.defaultLobs];

  return { name, account_name: account, lobs };
};

const request = async (path, cfg) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${cfg.baseUrl}${path}`, { headers });
  if (res.status === 401 && token) {
    token = null;
    await authenticate(cfg);
    return request(path, cfg);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Directus: GET ${path} failed with status ${res.status}${body ? `: ${body}` : ''}`);
  }
  return res.json();
};

const authenticate = async (cfg) => {
  if (cfg.token) {
    token = cfg.token;
    return;
  }
  if (cfg.username && cfg.password) {
    const res = await fetch(`${cfg.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cfg.username, password: cfg.password }),
    });
    if (!res.ok) {
      throw new Error(`Directus: login failed with status ${res.status}`);
    }
    const json = await res.json();
    token = json?.data?.access_token;
    if (!token) throw new Error('Directus: login did not return an access token');
  }
};

const fetchAllItems = async (collection, cfg) => {
  const basePath = collection === 'directus_users' ? '/users' : `/items/${collection}`;

  const attempt = async (query) => {
    const data = await request(`${basePath}?${query}`, cfg);
    return Array.isArray(data?.data) ? data.data : [];
  };

  try {
    return await attempt('limit=-1&fields=*');
  } catch (error) {
    const items = [];
    let offset = 0;
    for (;;) {
      const data = await request(`${basePath}?limit=100&offset=${offset}&fields=*`, cfg);
      const batch = Array.isArray(data?.data) ? data.data : [];
      items.push(...batch);
      offset += batch.length;
      if (batch.length === 0 || batch.length < 100) break;
    }
    return items;
  }
};

export const isDirectusConfigured = () => {
  const cfg = getDirectusConfig();
  return Boolean(cfg.baseUrl && (cfg.token || (cfg.username && cfg.password)));
};

export const getDirectusAgents = async (force = false) => {
  const cfg = ensureFreshContext();
  if (!cfg.baseUrl) return [];

  if (!force && cache && Date.now() - cache.ts < cfg.cacheTtlMs) return cache.agents;

  await authenticate(cfg);

  let rolesByName = new Map();
  if (cfg.collection === 'directus_users') {
    const roles = await request('/roles?limit=100', cfg);
    const list = Array.isArray(roles?.data) ? roles.data : [];
    rolesByName = new Map(list.map((r) => [r.id, r.name]));
  }

  const items = await fetchAllItems(cfg.collection, cfg);

  const agents = items
    .map((item) => normalizeAgent(item, item?.role ? rolesByName.get(item.role) : ''))
    .filter((agent) => agent && agent.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  cache = { ts: Date.now(), agents };
  return agents;
};

export const clearDirectusCache = () => {
  cache = null;
};