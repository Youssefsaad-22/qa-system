-- Database Schema for Call Center QA Sampling System
-- Run this script to initialize the database

-- Enable UUID extension if needed (not required for this schema)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('QA_WORKER', 'SUPERVISOR')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Calls Table (keyed on agent_id = Yeastar Dst extension)
CREATE TABLE IF NOT EXISTS calls (
    call_id SERIAL PRIMARY KEY,
    external_system_call_id VARCHAR(100) UNIQUE NOT NULL,
    agent_id VARCHAR(50),
    agent_name VARCHAR(100) DEFAULT '',
    call_timestamp TIMESTAMP NOT NULL,
    status VARCHAR(30) DEFAULT 'UNASSIGNED' CHECK (status IN ('UNASSIGNED', 'ASSIGNED', 'COMPLETED', 'PENDING_APPROVAL', 'DISCARDED', 'REJECTED')),
    assigned_to_user_id INT REFERENCES users(user_id),
    assigned_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure agent columns exist before the seed INSERT runs on pre-existing DBs.
ALTER TABLE calls ADD COLUMN IF NOT EXISTS agent_id VARCHAR(50);
ALTER TABLE calls ADD COLUMN IF NOT EXISTS agent_name VARCHAR(100) DEFAULT '';

-- Agent-ID-first overhaul: legacy account/LOB columns are gone. Must run before
-- the seed INSERT below (old DBs have these columns NOT NULL).
DROP INDEX IF EXISTS idx_calls_filters;
ALTER TABLE calls DROP COLUMN IF EXISTS account_name;
ALTER TABLE calls DROP COLUMN IF EXISTS line_of_business;

-- 3. Call Skips Table
CREATE TABLE IF NOT EXISTS call_skips (
    skip_id SERIAL PRIMARY KEY,
    call_id INT NOT NULL REFERENCES calls(call_id),
    qa_worker_id INT NOT NULL REFERENCES users(user_id),
    justification_reason TEXT NOT NULL,
    approval_status VARCHAR(20) DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    supervisor_id INT REFERENCES users(user_id),
    supervisor_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_assigned_to ON calls(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_call_skips_status ON call_skips(approval_status);
CREATE INDEX IF NOT EXISTS idx_call_skips_call_id ON call_skips(call_id);

-- 4. Sample Logs Table (rate limiting / audit of call requests)
CREATE TABLE IF NOT EXISTS sample_logs (
    log_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id),
    call_id INT REFERENCES calls(call_id),
    kind VARCHAR(30) NOT NULL DEFAULT 'SAMPLE' CHECK (kind IN ('SAMPLE', 'SKIP_REPLACEMENT')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sample_logs_user_time ON sample_logs(user_id, created_at);

-- 5. Settings Table (runtime-configurable system settings)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Default sampling rate-limit settings (overridable by supervisor)
INSERT INTO settings (key, value) VALUES
    ('sample_limit', '3'),
    ('sample_window_minutes', '60'),
    ('skip_daily_limit', '5')
ON CONFLICT (key) DO NOTHING;

-- Seed Data for Testing
-- Distinct passwords per user (hashed with bcrypt):
--   qa_worker_1  -> QaWorker1!pass
--   qa_worker_2  -> QaWorker2!pass
--   supervisor_1 -> Supervisor1!pass
-- Run `npm run set-seed-passwords` to reset existing dev users to these.
INSERT INTO users (username, password_hash, role) VALUES 
    ('qa_worker_1', '$2a$10$F4XysVW0LHLoCimg6aJWle2/pOw7xjrL2C.Pln.zSOfNGz2xx88gS', 'QA_WORKER'),
    ('qa_worker_2', '$2a$10$PcMWk6ucYrIijImaXKU2Be.aTTuhvIji3f8L6bes2.gx2Ks0sC5si', 'QA_WORKER'),
    ('supervisor_1', '$2a$10$2yWz92GYgdRTen9j0RSB1.DRn0ssRzHTRElZphvkCXIGCMSPNj7XK', 'SUPERVISOR')
ON CONFLICT (username) DO NOTHING;

-- Sample calls data (agent_id = extension)
INSERT INTO calls (external_system_call_id, agent_id, agent_name, call_timestamp, status) VALUES
    ('EXT-CALL-2024001', '7101', 'John Smith', '2024-01-15 10:30:00', 'UNASSIGNED'),
    ('EXT-CALL-2024002', '7101', 'John Smith', '2024-01-15 11:45:00', 'UNASSIGNED'),
    ('EXT-CALL-2024003', '7102', 'Jane Doe', '2024-01-15 14:20:00', 'UNASSIGNED'),
    ('EXT-CALL-2024004', '7103', 'Mike Johnson', '2024-01-16 09:15:00', 'UNASSIGNED'),
    ('EXT-CALL-2024005', '7103', 'Mike Johnson', '2024-01-16 13:30:00', 'UNASSIGNED'),
    ('EXT-CALL-2024006', '7104', 'Sarah Wilson', '2024-01-16 15:45:00', 'UNASSIGNED'),
    ('EXT-CALL-2024007', '7105', 'David Brown', '2024-01-17 11:00:00', 'UNASSIGNED'),
    ('EXT-CALL-2024008', '7105', 'David Brown', '2024-01-17 16:20:00', 'UNASSIGNED'),
    ('EXT-CALL-2024009', '7101', 'John Smith', '2024-01-17 10:00:00', 'UNASSIGNED'),
    ('EXT-CALL-2024010', '7106', 'Emily Davis', '2024-01-17 14:30:00', 'UNASSIGNED'),
    ('EXT-CALL-2024011', '7104', 'Sarah Wilson', '2024-01-18 09:30:00', 'UNASSIGNED'),
    ('EXT-CALL-2024012', '7107', 'Robert Taylor', '2024-01-18 12:45:00', 'UNASSIGNED'),
    ('EXT-CALL-2024013', '7102', 'Jane Doe', '2024-01-19 15:00:00', 'UNASSIGNED'),
    ('EXT-CALL-2024014', '7108', 'Chris Anderson', '2024-01-19 10:15:00', 'UNASSIGNED'),
    ('EXT-CALL-2024015', '7109', 'Lisa Martinez', '2024-01-19 13:30:00', 'UNASSIGNED')
ON CONFLICT (external_system_call_id) DO NOTHING;

-- Call data source + full raw CDR record (provider-agnostic). Additive, idempotent.
ALTER TABLE calls ADD COLUMN IF NOT EXISTS source_system VARCHAR(40) NOT NULL DEFAULT 'unknown';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS raw_data JSONB;
CREATE INDEX IF NOT EXISTS idx_calls_source ON calls(source_system);

-- Agent-ID-first overhaul (idempotent, safe on existing DBs): index only.
CREATE INDEX IF NOT EXISTS idx_calls_agent_id ON calls(agent_id);

-- Completed-review sync to Directus (call date/duration/number). Additive, idempotent.
ALTER TABLE calls ADD COLUMN IF NOT EXISTS directus_sent_at TIMESTAMP;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS directus_send_error TEXT;

-- Populate agent_id on pre-existing seed rows (ON CONFLICT above skips them).
UPDATE calls SET agent_id = v.agent_id, agent_name = v.agent_name
FROM (VALUES
    ('EXT-CALL-2024001', '7101', 'John Smith'),
    ('EXT-CALL-2024002', '7101', 'John Smith'),
    ('EXT-CALL-2024003', '7102', 'Jane Doe'),
    ('EXT-CALL-2024004', '7103', 'Mike Johnson'),
    ('EXT-CALL-2024005', '7103', 'Mike Johnson'),
    ('EXT-CALL-2024006', '7104', 'Sarah Wilson'),
    ('EXT-CALL-2024007', '7105', 'David Brown'),
    ('EXT-CALL-2024008', '7105', 'David Brown'),
    ('EXT-CALL-2024009', '7101', 'John Smith'),
    ('EXT-CALL-2024010', '7106', 'Emily Davis'),
    ('EXT-CALL-2024011', '7104', 'Sarah Wilson'),
    ('EXT-CALL-2024012', '7107', 'Robert Taylor'),
    ('EXT-CALL-2024013', '7102', 'Jane Doe'),
    ('EXT-CALL-2024014', '7108', 'Chris Anderson'),
    ('EXT-CALL-2024015', '7109', 'Lisa Martinez')
) AS v(ext, agent_id, agent_name)
WHERE calls.external_system_call_id = v.ext AND calls.agent_id IS NULL;
