export const STATUS_LABELS = {
  UNASSIGNED: 'Unassigned',
  ASSIGNED: 'Assigned',
  COMPLETED: 'Reviewed',
  PENDING_APPROVAL: 'Pending Approval',
  DISCARDED: 'Excluded',
  REJECTED: 'Denied',
};

export const statusLabel = (status) => STATUS_LABELS[status] || status;

export const badgeStyle = (status) => {
  const base = {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  };
  const colors = {
    UNASSIGNED: { backgroundColor: '#e2e3e5', color: '#383d41' },
    ASSIGNED: { backgroundColor: '#fff3cd', color: '#856404' },
    COMPLETED: { backgroundColor: '#d4edda', color: '#155724' },
    PENDING_APPROVAL: { backgroundColor: '#cce5ff', color: '#004085' },
    DISCARDED: { backgroundColor: '#e9ecef', color: '#495057' },
    REJECTED: { backgroundColor: '#f8d7da', color: '#721c24' },
  };
  return { ...base, ...(colors[status] || colors.UNASSIGNED) };
};