import { query } from '../../config/db.js';

export default class BaseAdapter {
  constructor(config = {}) {
    this.config = config;
    this.lastRunAt = null;
    this.requiresBaseUrl = true;
    this.supportsAnonymous = false;
    this.needsExternalSource = true;
  }

  get name() {
    return 'base';
  }

  get sourceSystem() {
    return this.config.sourceSystem || 'unknown';
  }

  get interval() {
    const raw = Number(this.config.interval);
    const interval = Number.isFinite(raw) && raw > 0 ? raw : 5 * 60 * 1000;
    return Math.max(interval, 30_000);
  }

  async authenticate() {
    // Override in adapters that require a token exchange before fetching.
  }

  async fetchCalls() {
    throw new Error(`${this.name}: fetchCalls() not implemented`);
  }

  normalize() {
    throw new Error(`${this.name}: normalize() not implemented`);
  }

  async sync() {
    await this.authenticate();
    const rawCalls = await this.fetchCalls(this.lastRunAt);

    if (!Array.isArray(rawCalls) || rawCalls.length === 0) {
      this.lastRunAt = new Date();
      return 0;
    }

    let inserted = 0;
    for (const raw of rawCalls) {
      const record = this.normalize(raw);
      if (!record?.external_system_call_id) continue;
      if (await this.upsertCall(record)) inserted += 1;
    }

    this.lastRunAt = new Date();
    return inserted;
  }

  async upsertCall(record) {
    const result = await query(
      `INSERT INTO calls (external_system_call_id, agent_id, agent_name, call_timestamp, status, source_system, raw_data)
       VALUES ($1, $2, $3, $4, 'UNASSIGNED', $5, $6)
       ON CONFLICT (external_system_call_id) DO NOTHING`,
      [
        String(record.external_system_call_id),
        record.agent_id ? String(record.agent_id) : null,
        record.agent_name || '',
        record.call_timestamp ? new Date(record.call_timestamp) : new Date(),
        record.source_system || this.sourceSystem,
        record.raw_data ? JSON.parse(JSON.stringify(record.raw_data)) : null,
      ]
    );
    return result.rowCount > 0;
  }

  async request(path, options = {}) {
    const baseUrl = (this.config.baseUrl || '').replace(/\/+$/, '');
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `${this.name}: ${options.method || 'GET'} ${path} failed with status ${res.status}${body ? `: ${body}` : ''}`
      );
    }

    return res.json().catch(() => null);
  }
}