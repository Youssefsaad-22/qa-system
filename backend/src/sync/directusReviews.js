import { getDirectusConfig } from './directusAgents.js';

let token = null;
let lastFingerprint = null;

const fingerprint = (cfg) => [cfg.baseUrl, cfg.token, cfg.username, cfg.password].join('|');

const ensureContext = () => {
  const cfg = getDirectusConfig();
  const fp = fingerprint(cfg);
  if (fp !== lastFingerprint) {
    lastFingerprint = fp;
    token = null;
  }
  return cfg;
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

export const isReviewsSyncConfigured = () => {
  const cfg = getDirectusConfig();
  if (!cfg.baseUrl) return false;
  if (cfg.reviewsFlowUrl || cfg.reviewsFlowId) return true;
  return Boolean(cfg.reviewsCollection && (cfg.token || (cfg.username && cfg.password)));
};

const findDirectusError = (value) => {
  if (!value) return null;
  const items = Array.isArray(value) ? value : [value];
  for (const item of items) {
    if (item && item.name === 'DirectusError') return item;
  }
  return null;
};

const resolveTarget = (cfg) => {
  if (cfg.reviewsFlowUrl) {
    return { type: 'flow', url: cfg.reviewsFlowUrl };
  }
  if (cfg.reviewsFlowId) {
    return { type: 'flow', url: `${cfg.baseUrl}/flows/trigger/${cfg.reviewsFlowId}` };
  }
  if (cfg.reviewsCollection) {
    return { type: 'collection', url: `${cfg.baseUrl}/items/${cfg.reviewsCollection}` };
  }
  return null;
};

/**
 * POST a completed-review record to Directus.
 * Target is either a Flow trigger (preferred) or a collection item.
 * Returns the Directus response. Throws on failure (caller decides how to handle).
 */
export const sendReviewToDirectus = async (payload) => {
  const cfg = ensureContext();
  const target = resolveTarget(cfg);
  if (!cfg.baseUrl || !target) {
    throw new Error('Directus: reviews sink is not configured');
  }

  // Always authenticate: collection writes need the token, and authenticating
  // a Flow trigger makes the Flow run with this user's accountability (so
  // operations like "Send Notification" have the permissions they need).
  await authenticate(cfg);

  const isFlowGet = target.type === 'flow' && cfg.reviewsFlowMethod === 'GET';

  let url = target.url;
  let method = 'POST';
  let body = JSON.stringify(payload);
  if (isFlowGet) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
      if (value !== null && value !== undefined && value !== '') qs.set(key, String(value));
    }
    url = `${url}${url.includes('?') ? '&' : '?'}${qs.toString()}`;
    method = 'GET';
    body = undefined;
  }

  const buildHeaders = () => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    let res = await fetch(url, {
      method,
      headers: buildHeaders(),
      body,
      signal: controller.signal,
    });

    if (res.status === 401 && token) {
      token = null;
      await authenticate(cfg);
      res = await fetch(url, {
        method,
        headers: buildHeaders(),
        body,
        signal: controller.signal,
      });
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Directus: ${method} ${target.type} failed with status ${res.status}${text ? `: ${text}` : ''}`);
    }

    const json = await res.json().catch(() => null);
    const result = json?.data ?? json;

    const opError = findDirectusError(result);
    if (opError) {
      const reason = opError.extensions?.reason
        || opError.extensions?.field && `field "${opError.extensions.field}" is invalid`
        || opError.message
        || JSON.stringify(opError.extensions || opError);
      throw new Error(`Directus: flow operation failed${opError.code ? ` (${opError.code})` : ''}: ${reason}`);
    }

    return result;
  } finally {
    clearTimeout(timeout);
  }
};
