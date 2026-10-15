import BaseAdapter from './baseAdapter.js';
import { getDirectusAgents, isDirectusConfigured, getDirectusConfig } from '../directusAgents.js';

const FALLBACK_AGENTS = [
  { name: 'John Smith', account_name: 'Acme Corp', lobs: ['Customer Support', 'Technical Support'] },
  { name: 'Jane Doe', account_name: 'Acme Corp', lobs: ['Sales', 'Customer Support'] },
  { name: 'Mike Johnson', account_name: 'Beta Inc', lobs: ['Sales', 'Technical Support'] },
  { name: 'Sarah Wilson', account_name: 'Beta Inc', lobs: ['Technical Support', 'Customer Support'] },
  { name: 'David Brown', account_name: 'Gamma LLC', lobs: ['Sales', 'Customer Support'] },
  { name: 'Emily Davis', account_name: 'Gamma LLC', lobs: ['Technical Support', 'Sales'] },
  { name: 'Robert Taylor', account_name: 'Acme Corp', lobs: ['Customer Support'] },
  { name: 'Chris Anderson', account_name: 'Beta Inc', lobs: ['Sales', 'Technical Support'] },
  { name: 'Lisa Martinez', account_name: 'Gamma LLC', lobs: ['Customer Support', 'Sales'] },
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export default class MockAdapter extends BaseAdapter {
  constructor(config = {}) {
    super(config);
    this.requiresBaseUrl = false;
    this.supportsAnonymous = true;
    this.needsExternalSource = false;
    this.counter = 0;
    this.limit = Number(config.batchSize) || 25;
    this._roster = null;
    this._rosterWarned = false;
  }

  get name() {
    return 'mock';
  }

  get interval() {
    return Math.max(super.interval, 60_000);
  }

  async getRoster() {
    if (isDirectusConfigured()) {
      try {
        const real = await getDirectusAgents();
        if (real.length > 0) {
          this._roster = real;
          return real;
        }
      } catch (error) {
        if (!this._rosterWarned) {
          console.error(`Mock: Directus agent fetch failed (${error.message}); using fallback roster`);
          this._rosterWarned = true;
        }
      }
    }

    this._roster = FALLBACK_AGENTS;
    return this._roster;
  }

  async fetchCalls() {
    const roster = await this.getRoster();
    const calls = [];
    for (let i = 0; i < this.limit; i++) {
      const agent = pick(roster);
      const rosterIndex = roster.indexOf(agent);
      const agentId = agent.agent_id || String(7100 + rosterIndex);
      const ts = new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000));
      this.counter += 1;
      calls.push({
        id: `MOCK-${Date.now()}-${this.counter}-${Math.floor(Math.random() * 100000)}`,
        agent_id: agentId,
        agent_name: agent.name,
        call_timestamp: ts.toISOString(),
      });
    }
    return calls;
  }

  normalize(raw) {
    return {
      external_system_call_id: raw.id,
      agent_id: raw.agent_id,
      agent_name: raw.agent_name,
      call_timestamp: raw.call_timestamp,
      source_system: 'mock',
      raw_data: {
        agent_id: raw.agent_id,
        agent_name: raw.agent_name,
        call_timestamp: raw.call_timestamp,
      },
    };
  }
}

export const _reportDirectusSource = () => {
  const cfg = getDirectusConfig();
  return {
    configured: isDirectusConfigured(),
    baseUrl: cfg.baseUrl ? cfg.baseUrl : null,
    collection: cfg.baseUrl ? cfg.collection : null,
    nameField: cfg.baseUrl ? (cfg.nameField || 'first_name+last_name') : null,
    accountField: cfg.baseUrl ? cfg.accountField : null,
    lobField: cfg.baseUrl ? cfg.lobField : null,
  };
};