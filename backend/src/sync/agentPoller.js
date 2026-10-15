import { getDirectusAgents, getDirectusConfig, isDirectusConfigured } from './directusAgents.js';

let pollTimer = null;

const state = {
  enabled: false,
  configured: false,
  baseUrl: null,
  collection: null,
  pollIntervalMs: 0,
  lastFetchAt: null,
  lastSuccessAt: null,
  lastAgentCount: 0,
  lastError: null,
  nextFetchAt: null,
  lastWebhookAt: null,
};

export const markWebhookReceived = () => {
  state.lastWebhookAt = new Date().toISOString();
};

export const startAgentPoller = async () => {
  if (pollTimer) return;

  const cfg = getDirectusConfig();
  if (!isDirectusConfigured()) {
    console.log('Agent poller: Directus not configured, skipping');
    return;
  }

  state.enabled = true;
  state.configured = true;
  state.baseUrl = cfg.baseUrl;
  state.collection = cfg.collection;
  state.pollIntervalMs = cfg.pollIntervalMs;

  const run = async () => {
    state.nextFetchAt = Date.now() + state.pollIntervalMs;
    try {
      const agents = await getDirectusAgents(true);
      state.lastSuccessAt = new Date().toISOString();
      state.lastAgentCount = agents.length;
      state.lastError = null;
    } catch (error) {
      state.lastError = error.message;
    } finally {
      state.lastFetchAt = new Date().toISOString();
    }
  };

  await run();
  pollTimer = setInterval(run, state.pollIntervalMs);
  console.log(`Agent poller: fetching Directus agents every ${Math.round(state.pollIntervalMs / 1000)}s`);
};

export const stopAgentPoller = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  state.enabled = false;
};

export const getAgentSyncStatus = () => ({
  ...state,
  collection: state.collection,
  lastFetchAt: state.lastFetchAt ? new Date(state.lastFetchAt).toISOString() : null,
  lastSuccessAt: state.lastSuccessAt ? new Date(state.lastSuccessAt).toISOString() : null,
  nextFetchAt: state.nextFetchAt ? new Date(state.nextFetchAt).toISOString() : null,
  lastWebhookAt: state.lastWebhookAt ? new Date(state.lastWebhookAt).toISOString() : null,
});