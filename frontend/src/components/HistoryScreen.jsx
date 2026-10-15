import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { badgeStyle, statusLabel } from '../utils/status';

function HistoryScreen() {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/calls/history');
      setHistory(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleRowClick = (call) => {
    if (call.status === 'ASSIGNED' || call.status === 'PENDING_APPROVAL') {
      navigate('/', { state: { reopen: call } });
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <button onClick={() => navigate(-1)} style={styles.backButton}>
          ← Back
        </button>
      </div>
      <div style={styles.header}>
        <h1 style={styles.title}>My Call History</h1>
        <p style={styles.subtitle}>All calls assigned to you. Click an open call to resume it.</p>
      </div>

      {error && <div style={styles.errorBanner}>{error}</div>}

      <div style={styles.tableCard}>
        {loading ? (
          <p style={styles.empty}>Loading history...</p>
        ) : history.length === 0 ? (
          <p style={styles.empty}>No calls assigned to you yet.</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.headerRow}>
                  <th style={styles.th}>Call ID</th>
                  <th style={styles.th}>Agent ID</th>
                  <th style={styles.th}>Agent</th>
                  <th style={styles.th}>Call Time</th>
                  <th style={styles.th}>Assigned At</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Skip Reason</th>
                </tr>
              </thead>
              <tbody>
                {history.map((call) => {
                  const actionable = call.status === 'ASSIGNED' || call.status === 'PENDING_APPROVAL';
                  return (
                    <tr
                      key={call.call_id}
                      style={{ ...styles.row, ...(actionable ? styles.clickableRow : {}) }}
                      onClick={() => handleRowClick(call)}
                      title={actionable ? 'Click to open' : undefined}
                    >
                      <td style={styles.td}>
                        <code style={styles.callId}>{call.external_system_call_id}</code>
                      </td>
                      <td style={styles.td}>{call.agent_id}</td>
                      <td style={styles.td}>{call.agent_name}</td>
                      <td style={styles.td}>{new Date(call.call_timestamp).toLocaleString()}</td>
                      <td style={styles.td}>{call.assigned_at ? new Date(call.assigned_at).toLocaleString() : '-'}</td>
                      <td style={styles.td}>
                        <span style={badgeStyle(call.status)}>{statusLabel(call.status)}</span>
                      </td>
                      <td style={styles.td}>{call.justification_reason || '-'}</td>
                    </tr>
                  );
                })}
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
  header: {
    marginBottom: '20px',
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
  row: {
    borderBottom: '1px solid #eee',
  },
  td: {
    padding: '10px 16px',
    color: '#333',
    verticalAlign: 'top',
    borderBottom: '1px solid #f0f0f0',
    whiteSpace: 'nowrap',
  },
  clickableRow: {
    cursor: 'pointer',
  },
  callId: {
    fontSize: '14px',
    fontFamily: 'monospace',
    backgroundColor: '#f5f5f5',
    padding: '4px 8px',
    borderRadius: '4px',
    color: '#1a1a1a',
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

export default HistoryScreen;