import fs from 'fs';
import path from 'path';
import readXlsxFile from 'read-excel-file/node';
import BaseAdapter from './baseAdapter.js';

const parseCsvLine = (line) => {
  const parts = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === '\t' && !inQuotes) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts;
};

const normalizeKey = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

export default class YeastarAdapter extends BaseAdapter {
  constructor(config = {}) {
    super(config);
    this.token = null;
    this.requiresBaseUrl = false;
  }

  get name() {
    return 'yeastar';
  }

  async authenticate() {
    if (this.token) return;

    if (this.config.username && this.config.password) {
      const res = await this.request('/security/login', {
        method: 'POST',
        body: JSON.stringify({ username: this.config.username, password: this.config.password }),
      });
      const token = res?.token || res?.data?.token;
      if (!token) {
        throw new Error(`${this.name}: login did not return a token`);
      }
      this.token = token;
    }
  }

  get authHeader() {
    if (this.token) return { Authorization: this.token };
    if (this.config.apiKey) return { Authorization: this.config.apiKey };
    return {};
  }

  async sync() {
    const csvFiles = this.csvFiles();
    if (csvFiles.length > 0 || this.config.csvFile) {
      return await this.syncCsv();
    }
    return await super.sync();
  }

  csvFiles() {
    if (this.config.csvFile) return [this.config.csvFile];
    if (!this.config.csvDir) return [];
    return fs
      .readdirSync(this.config.csvDir, { withFileTypes: true })
      .filter((e) => e.isFile() && !this.isProcessed(e.name))
      .map((e) => path.join(this.config.csvDir, e.name))
      .sort();
  }

  isProcessed(name) {
    return /\.processed$/i.test(name) || /\.(imported|done)$/i.test(name);
  }

  async syncCsv() {
    let total = 0;
    for (const file of this.csvFiles()) {
      let inserted = 0;
      try {
        inserted = await this.importCsvFile(file);
      } catch (error) {
        console.error(`${this.name}: failed to import ${file}: ${error.message}`);
        continue;
      }
      total += inserted;
      await this.markProcessed(file);
    }
    return total;
  }

  async markProcessed(file) {
    const dir = path.dirname(file);
    const processedDir = path.join(dir, 'processed');
    try {
      if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });
      const dest = path.join(processedDir, `${path.basename(file)}.processed`);
      fs.renameSync(file, dest);
    } catch (error) {
      console.warn(`${this.name}: could not move ${file} to processed/: ${error.message}`);
    }
  }

  async importCsvFile(file) {
    const ext = path.extname(file).toLowerCase();
    const lines =
      ext === '.xlsx'
        ? await this.readXlsxRows(file)
        : this.readTextRows(fs.readFileSync(file, 'utf-8'));
    if (!Array.isArray(lines) || lines.length < 2) return 0;

    const header = lines[0].map(normalizeKey);
    const rawHeader = lines[0];
    const byHeader = (row, name) => {
      const idx = header.indexOf(normalizeKey(name));
      return idx === -1 ? '' : String(row[idx] ?? '').trim();
    };

    const groups = new Map();
    for (const row of lines.slice(1)) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const uid = byHeader(row, 'UID');
      if (!uid) continue;
      if (!groups.has(uid)) groups.set(uid, []);
      groups.get(uid).push(row);
    }

    let inserted = 0;
    for (const [uid, rows] of groups) {
      const record = this.normalizeCdrGroup(uid, rows, byHeader, rawHeader);
      if (!record) continue;
      if (await this.upsertCall(record)) inserted += 1;
    }
    return inserted;
  }

  readTextRows(text) {
    return text
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0)
      .map(parseCsvLine);
  }

  async readXlsxRows(file) {
    const sheets = await readXlsxFile(file);
    const rows = (Array.isArray(sheets) && sheets[0]?.data) || [];
    return rows.map((row) =>
      row.map((cell) => {
        if (cell instanceof Date) return this.formatDate(cell);
        if (cell instanceof Object && typeof cell === 'object' && 'text' in cell) return cell.text;
        return cell;
      })
    );
  }

  formatDate(date) {
    if (Number.isNaN(date.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
  }

  normalizeCdrGroup(uid, rows, byHeader, rawHeader) {
    const isAnsweredLeg = (r) => {
      const disp = (byHeader(r, 'Disposition') || '').toUpperCase();
      return disp.includes('ANSWER') || byHeader(r, 'Answered') === '1';
    };

    if (!rows.some(isAnsweredLeg)) return null;

    const looksLikePerson = (s) => /\s/.test(s) && !/[_\-]/.test(s);

    let personLeg = null;
    let memberAnsweredNumber = '';
    let memberAnsweredName = '';
    let firstAnsweredDst = '';
    let timestamp = null;

    for (const r of rows) {
      const man = byHeader(r, 'Member Answered Number');
      if (man && !memberAnsweredNumber) memberAnsweredNumber = man;
      const maname = byHeader(r, 'Member Answered Name');
      if (maname && !memberAnsweredName) memberAnsweredName = maname;

      if (isAnsweredLeg(r)) {
        const dst = byHeader(r, 'Dst');
        const prefix = byHeader(r, 'Dstnameprefix');
        const dstname = byHeader(r, 'Dstname');
        if (!firstAnsweredDst && dst) firstAnsweredDst = dst;
        if (!personLeg && dst && !prefix && dstname && looksLikePerson(dstname)) {
          personLeg = { dst, dstname };
        }
      }

      const dt = byHeader(r, 'Datetime');
      if (dt && !timestamp) timestamp = this.toTimestamp(dt);
    }

    // agent_id = extension from the answered agent leg (Dst);
    // fall back to the Queue leg's Member Answered Number, then any answered leg's Dst.
    const agentId = (personLeg && personLeg.dst) || memberAnsweredNumber || firstAnsweredDst;
    const agentName = (personLeg && personLeg.dstname) || memberAnsweredName || '';

    if (!timestamp || !agentId) return null;

    const legs = rows.map((r) => {
      const leg = {};
      rawHeader.forEach((h, i) => {
        leg[String(h || '')] = r[i] ?? '';
      });
      return leg;
    });

    return {
      external_system_call_id: uid,
      agent_id: String(agentId),
      agent_name: agentName,
      call_timestamp: timestamp,
      source_system: 'yeastar',
      raw_data: {
        columns: rawHeader,
        legs,
      },
    };
  }

  toTimestamp(value) {
    const m = String(value).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
    if (!m) return null;
    const date = new Date(`${m[1]}T${m[2]}`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  async fetchCalls(since) {
    const params = new URLSearchParams({ page: '1', page_size: '100' });
    if (since) params.set('date_from', since.toISOString());

    const res = await this.request(`/cdr/list?${params.toString()}`, {
      headers: this.authHeader,
    });

    const items =
      res?.data ||
      res?.list ||
      res?.cdr_list ||
      (Array.isArray(res) ? res : null);

    if (!Array.isArray(items)) {
      throw new Error(`${this.name}: unexpected CDR response shape`);
    }
    return items;
  }

  normalize(raw) {
    return {
      external_system_call_id: String(
        raw.call_id || raw.callUuid || raw.uuid || raw.id || ''
      ),
      agent_id: String(raw.agent_id || raw.extension || raw.dst || raw.agent || ''),
      agent_name: raw.agent_name || raw.agent || '',
      call_timestamp: raw.start_time || raw.call_timestamp || raw.time || new Date(),
    };
  }
}