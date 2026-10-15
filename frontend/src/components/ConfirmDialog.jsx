function ConfirmDialog({ title, message, confirmLabel, cancelLabel, onConfirm, onCancel, danger }) {
  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.title}>{title}</h3>
        <p style={styles.message}>{message}</p>
        <div style={styles.actions}>
          <button style={styles.cancelButton} onClick={onCancel} autoFocus>
            {cancelLabel || 'Cancel'}
          </button>
          <button
            style={danger ? styles.dangerButton : styles.confirmButton}
            onClick={onConfirm}
          >
            {confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  dialog: {
    backgroundColor: '#ffffff',
    borderRadius: '10px',
    padding: '28px',
    width: '420px',
    maxWidth: '90vw',
    boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
  },
  title: {
    margin: 0,
    marginBottom: '10px',
    fontSize: '18px',
    color: '#1a1a1a',
  },
  message: {
    margin: 0,
    marginBottom: '24px',
    fontSize: '14px',
    color: '#555',
    lineHeight: '1.5',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
  },
  cancelButton: {
    padding: '9px 18px',
    backgroundColor: '#fff',
    color: '#555',
    border: '1px solid #ddd',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  confirmButton: {
    padding: '9px 18px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  dangerButton: {
    padding: '9px 18px',
    backgroundColor: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
};

export default ConfirmDialog;