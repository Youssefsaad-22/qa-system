import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { badgeStyle, statusLabel } from '../utils/status';
import PasswordInput from './PasswordInput';
import ConfirmDialog from './ConfirmDialog';

function SupervisorScreen() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('skips');
  const [pendingSkips, setPendingSkips] = useState([]);
  const [allCalls, setAllCalls] = useState([]);
  const [allCallsPage, setAllCallsPage] = useState(1);
  const [allCallsTotal, setAllCallsTotal] = useState(0);
  const [allCallsTotalPages, setAllCallsTotalPages] = useState(1);
  const [callSource, setCallSource] = useState('all');
  const [callSources, setCallSources] = useState([]);
  const [callColumns, setCallColumns] = useState(null);
  const [workerRecords, setWorkerRecords] = useState([]);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsTotalPages, setRecordsTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resolving, setResolving] = useState({});
  const [sampleLimit, setSampleLimit] = useState(3);
  const [skipDailyLimit, setSkipDailyLimit] = useState(5);
  const [savingConfig, setSavingConfig] = useState(false);
  const [qaUsers, setQaUsers] = useState([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);

  const fetchQaUsers = useCallback(async () => {
    try {
      const response = await api.get('/supervisor/users');
      setQaUsers(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch users');
    }
  }, []);

  const handleDeleteUser = async (user) => {
    setError('');
    setSuccess('');
    try {
      await api.delete(`/supervisor/users/${user.user_id}`);
      setSuccess(`QA worker "${user.username}" deleted`);
      fetchQaUsers();
      setUserToDelete(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete user');
      setUserToDelete(null);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreatingUser(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/supervisor/users', {
        username: newUsername,
        password: newPassword,
      });
      setSuccess(`QA worker "${newUsername.trim()}" created`);
      setNewUsername('');
      setNewPassword('');
      fetchQaUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user');
    } finally {
      setCreatingUser(false);
    }
  };

  const fetchSamplingConfig = useCallback(async () => {
    try {
      const response = await api.get('/supervisor/sampling-config');
      setSampleLimit(response.data.sample_limit);
      setSkipDailyLimit(response.data.skip_daily_limit);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch sampling config');
    }
  }, []);

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    setError('');
    setSuccess('');
    try {
      const response = await api.post('/supervisor/sampling-config', {
        sample_limit: Number(sampleLimit),
        skip_daily_limit: Number(skipDailyLimit),
      });
      setSampleLimit(response.data.sample_limit);
      setSkipDailyLimit(response.data.skip_daily_limit);
      setSuccess('Rate limits updated');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update limits');
    } finally {
      setSavingConfig(false);
    }
  };

  const fetchPendingSkips = useCallback(async () => {
    try {
      const response = await api.get('/supervisor/pending-skips');
      setPendingSkips(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch pending skips');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAllCalls = useCallback(async (page = 1, source = callSource) => {
    try {
      const response = await api.get('/supervisor/calls', {
        params: { page, source: source === 'all' ? undefined : source },
      });
      setAllCalls(response.data.calls);
      setAllCallsTotal(response.data.total);
      setAllCallsTotalPages(response.data.total_pages);
      setCallSources(response.data.sources || []);
      setCallColumns(response.data.columns || null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch calls');
    }
  }, [callSource]);

  const handleSourceChange = (value) => {
    setCallSource(value);
    setAllCallsPage(1);
    fetchAllCalls(1, value);
  };

  const fetchWorkerRecords = useCallback(async (page = 1) => {
    try {
      const response = await api.get('/supervisor/worker-records', { params: { page } });
      setWorkerRecords(response.data.records);
      setRecordsTotal(response.data.total);
      setRecordsTotalPages(response.data.total_pages);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch worker records');
    }
  }, []);

  useEffect(() => {
    fetchPendingSkips();
    fetchSamplingConfig();
  }, [fetchPendingSkips, fetchSamplingConfig]);

  useEffect(() => {
    fetchQaUsers();
  }, [fetchQaUsers]);

  useEffect(() => {
    fetchAllCalls(allCallsPage);
  }, [fetchAllCalls, allCallsPage]);

  useEffect(() => {
    fetchWorkerRecords(recordsPage);
  }, [fetchWorkerRecords, recordsPage]);

  const handleResolve = async (skipId, action) => {
    setError('');
    setSuccess('');
    setResolving(prev => ({ ...prev, [skipId]: true }));

    try {
      await api.post('/supervisor/resolve-skip', {
        skip_id: skipId,
        action,
        notes: '',
      });
      
      setSuccess(`Skip ${action.toLowerCase()}d successfully`);
      fetchPendingSkips();
      fetchAllCalls();
      fetchWorkerRecords();
      setRecordsPage(p => (p === 1 ? p : 1));
    } catch (err) {
      setError(err.response?.data?.error || `Failed to ${action.toLowerCase()} skip`);
    } finally {
      setResolving(prev => ({ ...prev, [skipId]: false }));
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading pending skips...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <button onClick={() => navigate('/')} style={styles.backButton}>
          ← Back
        </button>
      </div>
      <div style={styles.header}>
        <h1 style={styles.title}>Supervisor Dashboard</h1>
        <p style={styles.subtitle}>Review and approve/reject skipped calls</p>
      </div>

      <div style={styles.configCard}>
        <div style={styles.configInfo}>
          <h3 style={styles.configTitle}>Rate Limits</h3>
          <p style={styles.configText}>
            Max calls pulled per agent each time a QA worker samples that agent, and max skips per worker per day.
          </p>
        </div>
        <div style={styles.configControls}>
          <div style={styles.configField}>
            <label style={styles.label} htmlFor="sampleLimit">Max calls / agent</label>
            <input
              id="sampleLimit"
              type="number"
              min="1"
              max="1000"
              value={sampleLimit}
              onChange={(e) => setSampleLimit(e.target.value)}
              style={styles.configInput}
            />
          </div>
          <div style={styles.configField}>
            <label style={styles.label} htmlFor="skipDailyLimit">Max skips / day</label>
            <input
              id="skipDailyLimit"
              type="number"
              min="1"
              max="1000"
              value={skipDailyLimit}
              onChange={(e) => setSkipDailyLimit(e.target.value)}
              style={styles.configInput}
            />
          </div>
          <button
            onClick={handleSaveConfig}
            style={{ ...styles.approveButton, ...(savingConfig ? styles.buttonDisabled : {}) }}
            disabled={savingConfig}
          >
            {savingConfig ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div style={styles.tabs}>
        <button
          onClick={() => setActiveTab('skips')}
          style={{ ...styles.tab, ...(activeTab === 'skips' ? styles.activeTab : {}) }}
        >
          Pending Skips ({pendingSkips.length})
        </button>
        <button
          onClick={() => setActiveTab('calls')}
          style={{ ...styles.tab, ...(activeTab === 'calls' ? styles.activeTab : {}) }}
        >
          All Calls ({allCalls.length})
        </button>
        <button
          onClick={() => setActiveTab('records')}
          style={{ ...styles.tab, ...(activeTab === 'records' ? styles.activeTab : {}) }}
        >
          Worker Records ({workerRecords.length})
        </button>
        <button
          onClick={() => setActiveTab('users')}
          style={{ ...styles.tab, ...(activeTab === 'users' ? styles.activeTab : {}) }}
        >
          QA Workers ({qaUsers.length})
        </button>
      </div>

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

      {activeTab === 'skips' ? (
        <div style={styles.tableCard}>
        {pendingSkips.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>✓</div>
            <h3 style={styles.emptyTitle}>No Pending Skips</h3>
            <p style={styles.emptyText}>All caught up! No calls awaiting approval.</p>
          </div>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeader}>
                  <th style={styles.th}>Call ID</th>
                  <th style={styles.th}>Agent ID</th>
                  <th style={styles.th}>Agent</th>
                  <th style={styles.th}>QA Worker</th>
                  <th style={styles.th}>Skip Reason</th>
                  <th style={styles.th}>Requested</th>
                  <th style={styles.thActions}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingSkips.map((skip) => (
                  <tr key={skip.skip_id} style={styles.tr}>
                    <td style={styles.td}>
                      <code style={styles.callId}>{skip.external_system_call_id}</code>
                    </td>
                    <td style={styles.td}>{skip.agent_id}</td>
                    <td style={styles.td}>{skip.agent_name}</td>
                    <td style={styles.td}>{skip.qa_worker_name}</td>
                    <td style={styles.tdReason}>
                      <div style={styles.reasonText}>{skip.justification_reason}</div>
                    </td>
                    <td style={styles.td}>{formatDate(skip.skip_created_at)}</td>
                    <td style={styles.tdActions}>
                      <div style={styles.actionButtons}>
                        <button
                          onClick={() => handleResolve(skip.skip_id, 'APPROVE')}
                          style={{ ...styles.approveButton, ...(resolving[skip.skip_id] ? styles.buttonDisabled : {}) }}
                          disabled={resolving[skip.skip_id]}
                        >
                          {resolving[skip.skip_id] ? 'Approving...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleResolve(skip.skip_id, 'REJECT')}
                          style={{ ...styles.rejectButton, ...(resolving[skip.skip_id] ? styles.buttonDisabled : {}) }}
                          disabled={resolving[skip.skip_id]}
                        >
                          {resolving[skip.skip_id] ? 'Rejecting...' : 'Reject'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      ) : activeTab === 'calls' ? (
        <div style={styles.tableCard}>
          <div style={styles.sourceBar}>
            <label style={styles.label} htmlFor="callSource">Call data source</label>
            <select
              id="callSource"
              value={callSource}
              onChange={(e) => handleSourceChange(e.target.value)}
              style={styles.sourceSelect}
            >
              <option value="all">All (standard view)</option>
              {callSources.map((s) => (
                <option key={s} value={s}>
                  {s === 'mock' ? 'Mock (generated)' : s}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.paginationBar}>
            <span style={styles.paginationTotal}>
              {allCallsTotal.toLocaleString()} total calls
            </span>
            <div style={styles.paginationControls}>
              <button
                onClick={() => { setAllCallsPage(p => Math.max(1, p - 1)); }}
                disabled={allCallsPage <= 1}
                style={{ ...styles.pageButton, ...(allCallsPage <= 1 ? styles.buttonDisabled : {}) }}
              >
                ← Prev
              </button>
              <span style={styles.pageStatus}>
                Page {allCallsPage} of {allCallsTotalPages}
              </span>
              <button
                onClick={() => { setAllCallsPage(p => Math.min(allCallsTotalPages, p + 1)); }}
                disabled={allCallsPage >= allCallsTotalPages}
                style={{ ...styles.pageButton, ...(allCallsPage >= allCallsTotalPages ? styles.buttonDisabled : {}) }}
              >
                Next →
              </button>
            </div>
          </div>
          <div style={styles.tableWrapper}>
            {allCalls.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={styles.emptyIcon}>✓</div>
                <h3 style={styles.emptyTitle}>No Calls</h3>
                <p style={styles.emptyText}>No calls in the system yet.</p>
              </div>
            ) : callColumns && callSource !== 'all' ? (
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeader}>
                    {callColumns.map((col) => (
                      <th key={col} style={styles.th}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allCalls.map((call) => (
                    <tr key={call.call_id} style={styles.tr}>
                      {callColumns.map((col) => (
                        <td key={col} style={styles.td}>{call[col] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeader}>
                    <th style={styles.th}>Call ID</th>
                    <th style={styles.th}>Agent ID</th>
                    <th style={styles.th}>Agent</th>
                    <th style={styles.th}>Call Time</th>
                    <th style={styles.th}>Assigned To</th>
                    <th style={styles.th}>Assigned At</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Skip Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {allCalls.map((call) => (
                    <tr key={call.call_id} style={styles.tr}>
                      <td style={styles.td}>
                        <code style={styles.callId}>{call.external_system_call_id}</code>
                      </td>
                      <td style={styles.td}>{call.agent_id}</td>
                      <td style={styles.td}>{call.agent_name}</td>
                      <td style={styles.td}>{formatDate(call.call_timestamp)}</td>
                      <td style={styles.td}>{call.assigned_to || '-'}</td>
                      <td style={styles.td}>{call.assigned_at ? formatDate(call.assigned_at) : '-'}</td>
                      <td style={styles.td}>
                        <span style={badgeStyle(call.status)}>{statusLabel(call.status)}</span>
                      </td>
                      <td style={styles.td}>{call.justification_reason || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : activeTab === 'records' ? (
        <div style={styles.recordsCard}>
          <div style={styles.paginationBar}>
            <span style={styles.paginationTotal}>
              {recordsTotal.toLocaleString()} total records
            </span>
            <div style={styles.paginationControls}>
              <button
                onClick={() => setRecordsPage(p => Math.max(1, p - 1))}
                disabled={recordsPage <= 1}
                style={{ ...styles.pageButton, ...(recordsPage <= 1 ? styles.buttonDisabled : {}) }}
              >
                ← Prev
              </button>
              <span style={styles.pageStatus}>
                Page {recordsPage} of {recordsTotalPages}
              </span>
              <button
                onClick={() => setRecordsPage(p => Math.min(recordsTotalPages, p + 1))}
                disabled={recordsPage >= recordsTotalPages}
                style={{ ...styles.pageButton, ...(recordsPage >= recordsTotalPages ? styles.buttonDisabled : {}) }}
              >
                Next →
              </button>
            </div>
          </div>
          <div style={styles.tableWrapper}>
            {workerRecords.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={styles.emptyIcon}>✓</div>
                <h3 style={styles.emptyTitle}>No Finished Calls</h3>
                <p style={styles.emptyText}>Reviewed, excluded, and denied calls will show up here.</p>
              </div>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeader}>
                    <th style={styles.th}>QA Worker</th>
                    <th style={styles.th}>Call ID</th>
                    <th style={styles.th}>Agent ID</th>
                    <th style={styles.th}>Agent</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Skip Reason</th>
                    <th style={styles.th}>Supervisor Notes</th>
                    <th style={styles.th}>Resolved At</th>
                  </tr>
                </thead>
                <tbody>
                  {workerRecords.map((r) => (
                    <tr key={`${r.call_id}-${r.skip_id}`} style={styles.tr}>
                      <td style={styles.td}><strong>{r.qa_worker_name || '-'}</strong></td>
                      <td style={styles.td}>
                        <code style={styles.callId}>{r.external_system_call_id}</code>
                      </td>
                      <td style={styles.td}>{r.agent_id}</td>
                      <td style={styles.td}>{r.agent_name}</td>
                      <td style={styles.td}>
                        <span style={badgeStyle(r.status)}>{statusLabel(r.status)}</span>
                      </td>
                      <td style={styles.tdReason}>
                        <div style={styles.reasonText}>{r.justification_reason || '-'}</div>
                      </td>
                      <td style={styles.tdReason}>
                        <div style={styles.reasonText}>{r.supervisor_notes || '-'}</div>
                      </td>
                      <td style={styles.td}>{r.resolved_at ? formatDate(r.resolved_at) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <div style={styles.usersCard}>
          <form onSubmit={handleCreateUser} style={styles.createUserForm}>
            <div style={styles.createUserFields}>
              <div style={styles.createUserField}>
                <label style={styles.label} htmlFor="newUsername">Username</label>
                <input
                  id="newUsername"
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  style={styles.configInput}
                  placeholder="e.g. qa_worker_3"
                  required
                  autoComplete="off"
                />
              </div>
              <div style={styles.createUserField}>
                <PasswordInput
                  id="newPassword"
                  label="Password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <button
              type="submit"
              style={{ ...styles.approveButton, ...(creatingUser ? styles.buttonDisabled : {}) }}
              disabled={creatingUser}
            >
              {creatingUser ? 'Creating...' : 'Add QA Worker'}
            </button>
          </form>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeader}>
                  <th style={styles.th}>Username</th>
                  <th style={styles.th}>Role</th>
                  <th style={styles.th}>Created</th>
                </tr>
              </thead>
              <tbody>
                {qaUsers.map((u) => (
                  <tr key={u.user_id} style={styles.tr}>
                    <td style={styles.td}>
                      <span style={styles.monoText}>{u.username}</span>
                    </td>
                    <td style={styles.td}>{u.role}</td>
                    <td style={styles.td}>{u.created_at ? formatDate(u.created_at) : '-'}</td>
                    {u.role === 'QA_WORKER' && (
                      <td style={styles.td}>
                        <button
                          onClick={() => setUserToDelete(u)}
                          style={styles.deleteButton}
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {userToDelete && (
        <ConfirmDialog
          title="Delete QA Worker"
          message={`Are you sure you want to delete "${userToDelete.username}"? Their login will be disabled and they will no longer be able to access the system. This cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => handleDeleteUser(userToDelete)}
          onCancel={() => setUserToDelete(null)}
          danger
        />
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1400px',
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
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    gap: '16px',
    color: '#666',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #e0e0e0',
    borderTopColor: '#0066cc',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
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
  configCard: {
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    padding: '20px 24px',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '24px',
    flexWrap: 'wrap',
  },
  configInfo: {
    flex: 1,
    minWidth: '240px',
  },
  configTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: '4px',
  },
  configText: {
    color: '#666',
    fontSize: '13px',
  },
  configControls: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '12px',
    flexWrap: 'wrap',
  },
  configField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#333',
  },
  configInput: {
    width: '110px',
    padding: '8px 10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    outline: 'none',
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
  },
  tab: {
    padding: '10px 20px',
    backgroundColor: 'white',
    color: '#333',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  activeTab: {
    backgroundColor: '#0066cc',
    color: 'white',
    borderColor: '#0066cc',
  },
  errorBanner: {
    marginBottom: '16px',
    padding: '12px 16px',
    backgroundColor: '#fee',
    color: '#c00',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  successBanner: {
    marginBottom: '16px',
    padding: '12px 16px',
    backgroundColor: '#d4edda',
    color: '#155724',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  tableCard: {
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    overflow: 'hidden',
  },
  recordsCard: {
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    overflow: 'hidden',
  },
  countChip: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 24px',
    textAlign: 'center',
  },
  usersCard: {
    background: '#ffffff',
    borderRadius: '8px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  createUserForm: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '16px',
    flexWrap: 'wrap',
  },
  createUserFields: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
  },
  createUserField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  monoText: {
    fontFamily: 'monospace',
    fontSize: '14px',
  },
  deleteButton: {
    padding: '6px 12px',
    backgroundColor: '#fff',
    color: '#dc2626',
    border: '1px solid #fecaca',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'background-color 0.2s',
  },
  emptyIcon: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: '#d4edda',
    color: '#155724',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '28px',
    marginBottom: '16px',
  },
  emptyTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: '8px',
  },
  emptyText: {
    color: '#666',
    fontSize: '16px',
  },
  tableWrapper: {
    overflowX: 'auto',
  },
  paginationBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
    gap: '16px',
    flexWrap: 'wrap',
  },
  sourceBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  sourceSelect: {
    padding: '8px 10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    outline: 'none',
    minWidth: '200px',
    backgroundColor: 'white',
  },
  paginationTotal: {
    color: '#666',
    fontSize: '14px',
  },
  paginationControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  pageButton: {
    padding: '8px 14px',
    backgroundColor: 'white',
    color: '#0066cc',
    border: '1px solid #0066cc',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  pageStatus: {
    color: '#333',
    fontSize: '14px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  },
  tableHeader: {
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
  thActions: {
    padding: '12px 16px',
    textAlign: 'left',
    fontWeight: '600',
    color: '#333',
    borderBottom: '2px solid #e0e0e0',
    whiteSpace: 'nowrap',
    width: '180px',
  },
  tr: {
    borderBottom: '1px solid #eee',
    transition: 'background-color 0.1s',
  },
  td: {
    padding: '12px 16px',
    color: '#333',
    verticalAlign: 'top',
  },
  tdReason: {
    padding: '12px 16px',
    color: '#333',
    verticalAlign: 'top',
    maxWidth: '300px',
  },
  tdActions: {
    padding: '12px 16px',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
  },
  callId: {
    fontSize: '13px',
    fontFamily: 'monospace',
    backgroundColor: '#f5f5f5',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  reasonText: {
    maxWidth: '300px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  actionButtons: {
    display: 'flex',
    gap: '8px',
  },
  approveButton: {
    padding: '8px 16px',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background-color 0.2s',
  },
  rejectButton: {
    padding: '8px 16px',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background-color 0.2s',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
};

export default SupervisorScreen;