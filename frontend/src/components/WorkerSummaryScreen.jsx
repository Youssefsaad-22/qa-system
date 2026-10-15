import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

function WorkerSummaryScreen() {
  const navigate = useNavigate();
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/supervisor/worker-summary');
      setWorkers(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load worker summary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const totalCompleted = workers.reduce((sum, w) => sum + w.completed, 0);
  const totalRejected = workers.reduce((sum, w) => sum + w.rejected, 0);
  const totalDiscarded = workers.reduce((sum, w) => sum + w.discarded, 0);

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <button onClick={() => navigate(-1)} style={styles.backButton}>
          ← Back
        </button>
      </div>

      <div style={styles.header}>
        <h1 style={styles.title}>Worker Summary</h1>
        <p style={styles.subtitle}>Reviewed, excluded, and denied calls per QA worker</p>
      </div>

      <div style={styles.totalsBar}>
        <div style={styles.totalBox}>
          <span style={styles.totalNumber}>{totalCompleted}</span>
          <span style={styles.totalLabel}>Reviewed</span>
        </div>
        <div style={styles.totalBox}>
          <span style={styles.totalNumber}>{totalRejected}</span>
          <span style={styles.totalLabel}>Denied</span>
        </div>
        <div style={styles.totalBox}>
          <span style={styles.totalNumber}>{totalDiscarded}</span>
          <span style={styles.totalLabel}>Excluded</span>
        </div>
        <div style={styles.totalBox}>
          <span style={{ ...styles.totalNumber, color: '#0066cc' }}>{totalCompleted + totalRejected + totalDiscarded}</span>
          <span style={styles.totalLabel}>Total Finished</span>
        </div>
      </div>

      {error && <div style={styles.errorBanner}>{error}</div>}

      <div style={styles.tableCard}>
        {loading ? (
          <p style={styles.empty}>Loading worker summary...</p>
        ) : workers.length === 0 ? (
          <p style={styles.empty}>No finished calls yet.</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.headerRow}>
                  <th style={styles.th}>QA Worker</th>
                  <th style={styles.th}>Reviewed</th>
                  <th style={styles.th}>Denied</th>
                  <th style={styles.th}>Excluded</th>
                  <th style={styles.th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w) => (
                  <tr key={w.qa_worker_name} style={styles.tr}>
                    <td style={styles.td}><strong>{w.qa_worker_name}</strong></td>
                    <td style={styles.td}><span style={styles.chipGreen}>{w.completed}</span></td>
                    <td style={styles.td}><span style={styles.chipRed}>{w.rejected}</span></td>
                    <td style={styles.td}><span style={styles.chipGray}>{w.discarded}</span></td>
                    <td style={styles.td}><span style={styles.chipBlue}>{w.completed + w.rejected + w.discarded}</span></td>
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
    maxWidth: '900px',
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
  totalsBar: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    marginBottom: '16px',
  },
  totalBox: {
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    padding: '16px 24px',
    textAlign: 'center',
    minWidth: '120px',
    flex: 1,
  },
  totalNumber: {
    display: 'block',
    fontSize: '28px',
    fontWeight: '700',
    color: '#1a1a1a',
  },
  totalLabel: {
    display: 'block',
    fontSize: '13px',
    color: '#666',
    marginTop: '4px',
  },
  errorBanner: {
    marginBottom: '16px',
    padding: '12px 16px',
    backgroundColor: '#fee',
    color: '#c00',
    borderRadius: '4px',
    fontSize: '14px',
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
  },
  chipGreen: {
    padding: '4px 12px',
    borderRadius: '999px',
    backgroundColor: '#d4edda',
    color: '#155724',
    fontWeight: '600',
  },
  chipRed: {
    padding: '4px 12px',
    borderRadius: '999px',
    backgroundColor: '#f8d7da',
    color: '#721c24',
    fontWeight: '600',
  },
  chipGray: {
    padding: '4px 12px',
    borderRadius: '999px',
    backgroundColor: '#e9ecef',
    color: '#495057',
    fontWeight: '600',
  },
  chipBlue: {
    padding: '4px 12px',
    borderRadius: '999px',
    backgroundColor: '#e8f0fe',
    color: '#0066cc',
    fontWeight: '600',
  },
};

export default WorkerSummaryScreen;