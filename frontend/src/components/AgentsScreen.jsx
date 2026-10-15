import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

function AgentsScreen() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncStatus, setSyncStatus] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    api.get('/agents/sync-status')
      .then((res) => setSyncStatus(res.data))
      .catch(() => {});

    const tick = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const syncLine = () => {
    if (!syncStatus || !syncStatus.enabled) {
      return 'Directus sync: not configured';
    }
    const secAgo = (iso) => (iso ? Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000)) : null);
    const nextMs = syncStatus.nextFetchAt ? new Date(syncStatus.nextFetchAt).getTime() - now : 0;
    const seconds = Math.max(0, Math.ceil(nextMs / 1000));
    const lastAgo = secAgo(syncStatus.lastSuccessAt);
    const rosterText = syncStatus.lastAgentCount != null ? `${syncStatus.lastAgentCount} agents` : '';
    const timeText = lastAgo != null ? `${lastAgo}s ago` : 'never';
    const hookSec = secAgo(syncStatus.lastWebhookAt);
    const hookText = hookSec != null ? ` · webhook ${hookSec}s ago` : '';
    return (
      <span>
        Next Directus fetch in <strong>{seconds}s</strong> · last fetch {timeText} · {rosterText}
        {hookText}
        {syncStatus.lastError ? ` · error: ${syncStatus.lastError}` : ''}
      </span>
    );
  };

  const fetchAgents = useCallback(async (query) => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/agents', { params: { q: query } });
      setAgents(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAgents(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search, fetchAgents]);

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <button onClick={() => navigate(-1)} style={styles.backButton}>
          ← Back
        </button>
      </div>
      <div style={styles.header}>
        <h1 style={styles.title}>Agent Database</h1>
        <p style={styles.subtitle}>Agents with calls in the system</p>
      </div>

      <div style={styles.toolbar}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search agents by name..."
          style={styles.searchInput}
        />
        <span style={styles.count}>{agents.length} agent(s)</span>
      </div>

      <div style={styles.syncBar}>{syncLine()}</div>

      {error && <div style={styles.errorBanner}>{error}</div>}

      <div style={styles.tableCard}>
        {loading ? (
          <p style={styles.empty}>Loading agents...</p>
        ) : agents.length === 0 ? (
          <p style={styles.empty}>No agents found.</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.headerRow}>
                  <th style={styles.th}>Agent ID</th>
                  <th style={styles.th}>Agent Name</th>
                  <th style={styles.th}>Total Calls</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.agent_id} style={styles.tr}>
                    <td style={styles.td}>
                      <span style={styles.agentName}>{agent.agent_id}</span>
                    </td>
                    <td style={styles.tdWrap}>{agent.agent_name || '-'}</td>
                    <td style={styles.td}>
                      <span style={styles.totalCount}>{agent.total_calls}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1100px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '20px',
  },
  topBar: {
    marginBottom: '16px',
  },
  backButton: {
    padding: '8px 16px',
    backgroundColor: 'white',
    color: '#0066cc',
    border: '1px solid #0066cc',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  title: {
    fontSize: '28px',
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: '4px',
  },
  subtitle: {
    color: '#666',
    fontSize: '16px',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    marginBottom: '16px',
  },
  searchInput: {
    padding: '10px 14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    outline: 'none',
    minWidth: '280px',
  },
  count: {
    color: '#666',
    fontSize: '14px',
  },
  syncBar: {
    marginBottom: '16px',
    padding: '10px 16px',
    backgroundColor: '#f1f5f9',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    color: '#475569',
    fontSize: '13px',
  },
  tableCard: {
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    padding: '24px',
  },
  empty: {
    color: '#666',
    fontSize: '14px',
  },
  tableWrapper: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  },
  headerRow: {
    backgroundColor: '#f8f9fa',
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    fontWeight: '600',
    color: '#333',
    borderBottom: '2px solid #e0e0e0',
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: '1px solid #eee',
  },
  td: {
    padding: '10px 16px',
    color: '#333',
    verticalAlign: 'top',
    borderBottom: '1px solid #f0f0f0',
    whiteSpace: 'nowrap',
  },
  tdWrap: {
    padding: '10px 16px',
    color: '#333',
    verticalAlign: 'top',
    borderBottom: '1px solid #f0f0f0',
    whiteSpace: 'normal',
    minWidth: '160px',
  },
  agentName: {
    fontWeight: '600',
    color: '#1a1a1a',
  },
  totalCount: {
    fontWeight: '600',
  },
  errorBanner: {
    marginBottom: '16px',
    padding: '12px 16px',
    backgroundColor: '#fee',
    color: '#c00',
    borderRadius: '4px',
    fontSize: '14px',
  },
};

export default AgentsScreen;