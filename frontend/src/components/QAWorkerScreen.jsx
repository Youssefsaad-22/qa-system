import { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../services/api';
import { badgeStyle, statusLabel } from '../utils/status';

function QAWorkerScreen() {
  const location = useLocation();
  const [searchForm, setSearchForm] = useState({
    agent_id: '',
  });
  const [assignedCalls, setAssignedCalls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [skipTarget, setSkipTarget] = useState(null);
  const [skipReason, setSkipReason] = useState('');
  const [skipLoading, setSkipLoading] = useState(false);
  const [busyCallId, setBusyCallId] = useState(null);

  useEffect(() => {
    if (location.state?.reopen) {
      setAssignedCalls([location.state.reopen]);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  const handleSearchChange = (e) => {
    setSearchForm({ agent_id: e.target.value });
  };

  const handleSampleCall = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await api.post('/calls/sample', searchForm);
      if (response.data.calls && response.data.calls.length > 0) {
        setAssignedCalls(response.data.calls);
        setSuccess(`${response.data.count} call(s) assigned for agent ${searchForm.agent_id}!`);
      } else {
        setError(response.data.error || 'No calls available for this agent');
        setAssignedCalls([]);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to sample call');
      setAssignedCalls([]);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (call) => {
    setBusyCallId(call.call_id);
    setError('');
    setSuccess('');

    try {
      await api.post('/calls/complete', { call_id: call.call_id });
      const remaining = assignedCalls.filter(c => c.call_id !== call.call_id);
      setAssignedCalls(remaining);
      if (remaining.length === 0) {
        setSearchForm({ agent_id: '' });
        setSuccess(`Call ${call.external_system_call_id} marked as reviewed! Pick another agent or sample later.`);
      } else {
        setSuccess(`Call ${call.external_system_call_id} marked as reviewed!`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to complete call');
    } finally {
      setBusyCallId(null);
    }
  };

  const handleSkipOpen = (call) => {
    setSkipTarget(call);
    setSkipReason('');
    setShowSkipModal(true);
  };

  const handleSkipSubmit = async () => {
    if (!skipReason.trim()) {
      setError('Justification reason is required');
      return;
    }

    if (!skipTarget) return;

    setSkipLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.post('/calls/skip', {
        call_id: skipTarget.call_id,
        justification_reason: skipReason,
      });

      setSuccess('Call skipped. Awaiting supervisor approval.');
      setShowSkipModal(false);
      setSkipTarget(null);

      const remaining = assignedCalls.filter(c => c.call_id !== skipTarget.call_id);
      if (response.data.replacementCall) {
        setAssignedCalls([...remaining, response.data.replacementCall]);
        setSuccess(prev => prev + ' Replacement call assigned.');
      } else {
        setAssignedCalls(remaining);
        setSuccess(prev => prev + ' No replacement calls available for this agent.');
      }
      if (remaining.length === 0 && !response.data.replacementCall) {
        setSearchForm({ agent_id: '' });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to skip call');
    } finally {
      setSkipLoading(false);
    }
  };

  const copyCallId = (call) => {
    if (call) {
      navigator.clipboard.writeText(call.external_system_call_id);
      setSuccess('Call ID copied to clipboard!');
      setTimeout(() => setSuccess(''), 2000);
    }
  };

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>QA Worker - Call Sampling</h1>
        <p style={styles.subtitle}>Search for calls and review assigned recordings</p>
      </div>

      {assignedCalls.length === 0 && (
        <div style={styles.searchCard}>
          <h2 style={styles.sectionTitle}>Search & Sample Call</h2>
          <form onSubmit={handleSampleCall} style={styles.form}>
            <div style={styles.agentListSection}>
              <label style={styles.label} htmlFor="agent_id">Agent ID *</label>
              <input
                id="agent_id"
                name="agent_id"
                type="text"
                value={searchForm.agent_id}
                onChange={handleSearchChange}
                style={styles.input}
                required
                placeholder="e.g., 7154"
              />
            </div>

            <div style={styles.sampleAction}>
              <button
                type="submit"
                style={{ ...styles.primaryButton, ...(loading ? styles.buttonDisabled : {}) }}
                disabled={loading || !searchForm.agent_id.trim()}
              >
                {loading ? 'Sampling...' : 'Select Random Call'}
              </button>
            </div>
          </form>
        </div>
      )}

      {assignedCalls.length > 0 && (
        <div style={styles.batchHeader}>
          <h2 style={styles.sectionTitle}>Assigned Calls</h2>
          <span style={styles.batchCount}>{assignedCalls.length} active</span>
        </div>
      )}

      {assignedCalls.map((call) => {
        const busy = busyCallId === call.call_id;
        return (
          <div key={call.call_id} style={styles.callCard}>
            <div style={styles.callHeader}>
              <h3 style={styles.callTitle}>{call.agent_name || `Agent ${call.agent_id}`}</h3>
              <span style={badgeStyle(call.status)}>{statusLabel(call.status)}</span>
            </div>

            <div style={styles.callDetails}>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>External Call ID:</span>
                <div style={styles.callIdRow}>
                  <code style={styles.callId}>{call.external_system_call_id}</code>
                  <button
                    onClick={() => copyCallId(call)}
                    style={styles.copyButton}
                    title="Copy to clipboard"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Agent ID:</span>
                <span>{call.agent_id}</span>
              </div>
              {call.agent_name && (
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Agent:</span>
                  <span>{call.agent_name}</span>
                </div>
              )}
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Call Time:</span>
                <span>{new Date(call.call_timestamp).toLocaleString()}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>Assigned At:</span>
                <span>{call.assigned_at ? new Date(call.assigned_at).toLocaleString() : '-'}</span>
              </div>
            </div>

            {call.status === 'PENDING_APPROVAL' && (
              <div style={styles.pendingBanner}>
                This call was skipped and is awaiting supervisor approval.
              </div>
            )}

            <div style={styles.actionButtons}>
              {call.status === 'ASSIGNED' ? (
                <>
                  <button
                    onClick={() => handleComplete(call)}
                    style={{ ...styles.primaryButton, ...(busy ? styles.buttonDisabled : {}) }}
                    disabled={busy}
                  >
                    {busy ? 'Completing...' : 'Complete Review'}
                  </button>
                  <button
                    onClick={() => handleSkipOpen(call)}
                    style={{ ...styles.secondaryButton, ...(busy ? styles.buttonDisabled : {}) }}
                    disabled={busy}
                  >
                    Skip Call
                  </button>
                </>
              ) : (
                <p style={styles.readOnlyNote}>No actions available for this status.</p>
              )}
            </div>
          </div>
        );
      })}

      {error && (
        <div style={styles.errorBanner} onClick={clearMessages}>
          {error}
        </div>
      )}

      {success && (
        <div style={styles.successBanner} onClick={clearMessages}>
          {success}
        </div>
      )}

      {showSkipModal && (
        <div style={styles.modalOverlay} onClick={() => setShowSkipModal(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Skip Call - Justification Required</h3>
            <p style={styles.modalText}>
              Please provide a reason for skipping this call. This will be sent to a supervisor for approval.
            </p>
            <textarea
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
              style={styles.textarea}
              placeholder="Enter justification reason..."
              rows={4}
              maxLength={1000}
            />
            <div style={styles.modalActions}>
              <button 
                onClick={() => setShowSkipModal(false)}
                style={styles.secondaryButton}
                disabled={skipLoading}
              >
                Cancel
              </button>
              <button 
                onClick={handleSkipSubmit}
                style={{ ...styles.dangerButton, ...(skipLoading ? styles.buttonDisabled : {}) }}
                disabled={skipLoading}
              >
                {skipLoading ? 'Submitting...' : 'Submit Skip'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '800px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '24px',
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
  searchCard: {
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    padding: '24px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: '20px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
  },
  agentListSection: {
    borderTop: '1px solid #eee',
    paddingTop: '16px',
  },
  agentListTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '12px',
  },
  agentList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '320px',
    overflowY: 'auto',
  },
  agentRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '12px 16px',
    backgroundColor: '#f8f9fa',
    border: '1px solid #e0e0e0',
    borderRadius: '6px',
    fontSize: '15px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s',
  },
  agentRowActive: {
    backgroundColor: '#e8f0fe',
    borderColor: '#0066cc',
  },
  agentRowName: {
    fontWeight: '600',
    color: '#1a1a1a',
  },
  agentRowCount: {
    color: '#666',
    fontSize: '13px',
    whiteSpace: 'nowrap',
  },
  empty: {
    color: '#666',
    fontSize: '14px',
  },
  sampleAction: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
  },
  selectedAgent: {
    color: '#0066cc',
    fontWeight: '500',
    fontSize: '14px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#333',
  },
  input: {
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '16px',
    outline: 'none',
  },
  primaryButton: {
    padding: '14px 24px',
    backgroundColor: '#0066cc',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  secondaryButton: {
    padding: '14px 24px',
    backgroundColor: 'white',
    color: '#0066cc',
    border: '1px solid #0066cc',
    borderRadius: '4px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  dangerButton: {
    padding: '14px 24px',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  callCard: {
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    padding: '24px',
    marginTop: '16px',
  },
  batchHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0',
  },
  batchCount: {
    backgroundColor: '#e8f0fe',
    color: '#0066cc',
    borderRadius: '999px',
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: '600',
  },
  callTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1a1a1a',
  },
  callHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '20px',
    paddingBottom: '16px',
    borderBottom: '1px solid #eee',
  },
  statusBadge: {
    padding: '6px 12px',
    backgroundColor: '#fff3cd',
    color: '#856404',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  callDetails: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  detailRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  detailLabel: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  callIdRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  callId: {
    fontSize: '16px',
    fontFamily: 'monospace',
    backgroundColor: '#f5f5f5',
    padding: '8px 12px',
    borderRadius: '4px',
    color: '#1a1a1a',
  },
  copyButton: {
    padding: '8px 16px',
    backgroundColor: '#0066cc',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  actionButtons: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
  errorBanner: {
    marginTop: '16px',
    padding: '12px 16px',
    backgroundColor: '#fee',
    color: '#c00',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  successBanner: {
    marginTop: '16px',
    padding: '12px 16px',
    backgroundColor: '#d4edda',
    color: '#155724',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modal: {
    background: 'white',
    borderRadius: '8px',
    padding: '24px',
    width: '100%',
    maxWidth: '500px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: '8px',
  },
  modalText: {
    color: '#666',
    marginBottom: '16px',
    fontSize: '14px',
  },
  textarea: {
    width: '100%',
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    fontFamily: 'inherit',
    resize: 'vertical',
    outline: 'none',
    marginBottom: '20px',
    boxSizing: 'border-box',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  pendingBanner: {
    padding: '12px 16px',
    backgroundColor: '#cce5ff',
    color: '#004085',
    borderRadius: '4px',
    fontSize: '14px',
    marginBottom: '16px',
  },
  readOnlyNote: {
    color: '#666',
    fontSize: '14px',
  },
};

export default QAWorkerScreen;