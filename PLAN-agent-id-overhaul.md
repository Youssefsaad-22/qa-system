# Plan: Agent-ID-first overhaul (removes account/LOB from the QA system)

## Goal
QA search & sampling keys **exclusively on agent ID** = Yeastar `Dst` extension (e.g. `7154`). Free-text entry for now (IDs come from Directus later). **Full removal** of account/LOB from schema, API, sampling rules and UI. Directus roster sync (poller + webhook) stays. Agent display name comes from the CDR person leg.

## Confirmed data shape (from real export `backend/data/yeastar_csv/processed/*.xlsx.processed`, 69 cols)
- `Dst` = extension on every leg. In **multi-leg answered** groups: the agent leg has empty `Dstnameprefix` + `Dstname` = person (e.g. `nagwa sayed`) + `Dst` = extension (`7154`); the Queue leg mirrors it via `Member Answered Number`/`Member Answered Name`. In **single-leg answered** calls: `Dst` = extension (e.g. `6901`), `Dstname` = campaign.
- Agent-ID extraction rule (used at import **and** backfill):
  1. answered leg with empty `Dstnameprefix` and non-empty `Dstname` → `Dst` (person leg); else
  2. leg with non-empty `Member Answered Number` → that; else
  3. first answered leg → its `Dst`.
  - `agent_name` = person-leg `Dstname` if it looks like a person (has space, no `_`/`-`), else `Member Answered Name`, else `''`.

## 1. Database (`backend/migrations/schema.sql`, idempotent)
- **CREATE TABLE calls**: keep `external_system_call_id`, `call_timestamp`, `status`, assignment cols; add `agent_id VARCHAR(50)`, keep `agent_name` (display only). Drop `account_name`/`line_of_business` from the create.
- **Migration ALTERs** (run every boot): `ALTER TABLE calls ADD COLUMN IF NOT EXISTS agent_id VARCHAR(50);` then `DROP INDEX IF EXISTS idx_calls_filters;` `ALTER TABLE calls DROP COLUMN IF EXISTS account_name; ALTER TABLE calls DROP COLUMN IF EXISTS line_of_business;` + `CREATE INDEX IF NOT EXISTS idx_calls_agent_id ON calls(agent_id);`
- Fix **seed sample-calls INSERT** (remove account/LOB columns; give sample rows agent_id).
- Index on `agent_id` replaces `idx_calls_filters`.

## 2. Sync adapters
- **`baseAdapter.upsertCall`**: insert `agent_id`, `agent_name`; stop passing account/LOB.
- **`yeastar.js normalizeCdrGroup`**: compute `agent_id`/`agent_name` per rule above; delete account/LOB computation (`campaign`/`queue`/`lob` vars go). `raw_data` (full legs) unchanged.
- **`mock.js`**: emit synthetic `agent_id` (e.g. `7100+i`) + keep name from roster; drop account/LOB.

## 3. API (`callsController`, `supervisorController`, `agentsController`)
- **`sampleCall`**: body = `{ agent_id }` only. Select `WHERE agent_id = $1 AND status='UNASSIGNED' ORDER BY RANDOM() LIMIT $n FOR UPDATE SKIP LOCKED`. Once-per-agent-per-day rule now joins `sample_logs`→`calls` on **agent_id**.
- **`skipCall`** replacement: same agent_id criteria.
- **`getAgents`** (kept for later Directus-driven list): returns distinct `agent_id, agent_name` + unreviewed count, no params.
- **`getAssignedCalls` / `getCallHistory`**: select `agent_id`, `agent_name` (drop account/LOB).
- **`supervisorController`**: `STANDARD_CALL_COLUMNS` = external id, agent_id, agent_name, call time, status, assigned_to, assigned_at, skip reason. `getPendingSkips` / `getWorkerRecords` / `getWorkerSummary`: swap account/LOB for agent_id/agent_name. `getAllCalls` standard path + yeastar raw-column path unchanged in behaviour.
- **`agentsController.listAgents`**: group by `agent_id, agent_name`; drop account/LOB aggregates.

## 4. Frontend
- **`QAWorkerScreen`**: replace account+LOB+agent-list block with a single **Agent ID** text input + "Select Random Call". Assigned cards show Agent ID + name; remove Account/LOB detail rows; success messages use agent_id.
- **`HistoryScreen`**: drop Account/LOB columns; add Agent ID column.
- **`AgentsScreen`**: table = Agent ID / Agent Name / Total Calls (drop Account/LOB columns); roster sync bar unchanged.
- **`SupervisorScreen`**: update pending-skips table, worker-records table, and all-calls standard column list (yeastar raw-column view untouched).
- **`WorkerSummaryScreen`**: no account/LOB shown — unchanged.

## 5. Data migration (existing 8920 calls)
- New script `backend/scripts/backfillAgentId.js`: for every `source_system='yeastar'` call with `raw_data.legs`, apply the same agent-leg selection in JS to set `agent_id`/`agent_name`. **Purge** `source_system='mock'` rows (dev filler, meaningless under the new key). Run via `node scripts/backfillAgentId.js`.

## 6. Verification
1. `npm run init-db` (applies schema) → run backfill → spot-check a known UID (e.g. `20261011090411723A9` → agent_id `7154`, name `nagwa sayed`).
2. Start backend; curl flow: `POST /calls/sample {agent_id:"7154"}` → assigned; `POST /calls/complete`; `POST /calls/skip`; supervisor `GET /calls/pending-skips` + `POST /calls/resolve-skip`; `GET /supervisor/calls?source=yeastar`.
3. `npm run test:auth`; `npm run build:ui` (frontend builds clean).
4. Manual UI pass: worker sample by typing `7154`; history; agents list; supervisor All Calls + records.

## Notes / decisions
- Mock rows are purged (not backfilled) — they only existed as dev filler.
- `raw_data` keeps all 69 CDR columns, so account/LOB remain **retrievable from raw data** for the supervisor raw view even though they're gone from the schema.
- Directus roster sync untouched this round; later work will source agent IDs from it.
