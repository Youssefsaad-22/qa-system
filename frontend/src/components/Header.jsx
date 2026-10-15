import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Header() {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <header style={styles.header}>
      <div style={styles.logo}>
        <Link to="/" style={styles.logoLink}>QA Sampling System</Link>
      </div>
      <nav style={styles.nav}>
        <Link
          to="/"
          className="qa-nav-link"
          style={{
            ...styles.navLink,
            ...(location.pathname === '/' ? styles.activeLink : {}),
          }}
        >
          QA Worker
        </Link>
        {user?.role === 'SUPERVISOR' && (
          <Link
            to="/supervisor"
            className="qa-nav-link"
            style={{
              ...styles.navLink,
              ...(location.pathname === '/supervisor' ? styles.activeLink : {}),
            }}
          >
            Supervisor Dashboard
          </Link>
        )}
        {user?.role === 'SUPERVISOR' && (
          <Link
            to="/worker-summary"
            className="qa-nav-link"
            style={{
              ...styles.navLink,
              ...(location.pathname === '/worker-summary' ? styles.activeLink : {}),
            }}
          >
            Worker Summary
          </Link>
        )}
        <Link
          to="/agents"
          className="qa-nav-link"
          style={{
            ...styles.navLink,
            ...(location.pathname === '/agents' ? styles.activeLink : {}),
          }}
        >
          Agents
        </Link>
        <Link
          to="/history"
          className="qa-nav-link"
          style={{
            ...styles.navLink,
            ...(location.pathname === '/history' ? styles.activeLink : {}),
          }}
        >
          My History
        </Link>
        <Link
          to="/account"
          className="qa-nav-link"
          style={{
            ...styles.navLink,
            ...(location.pathname === '/account' ? styles.activeLink : {}),
          }}
        >
          Account
        </Link>
        <div style={styles.userInfo}>
          <span style={styles.userRole}>{user?.role?.replace('_', ' ')}</span>
          <span style={styles.username}>{user?.username}</span>
          <button onClick={logout} style={styles.logoutButton}>
            Logout
          </button>
        </div>
      </nav>
    </header>
  );
}

const styles = {
  header: {
    backgroundColor: 'white',
    borderBottom: '1px solid #e0e0e0',
    padding: '0 24px',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  logo: {
    height: '60px',
    display: 'flex',
    alignItems: 'center',
  },
  logoLink: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#1a1a1a',
    textDecoration: 'none',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '60px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  navLink: {
    padding: '8px 16px',
    color: '#333',
    textDecoration: 'none',
    fontWeight: '500',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  activeLink: {
    backgroundColor: '#e8f0fe',
    color: '#0066cc',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  userRole: {
    fontSize: '12px',
    padding: '4px 8px',
    backgroundColor: '#e8f0fe',
    color: '#0066cc',
    borderRadius: '4px',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  username: {
    color: '#666',
    fontSize: '14px',
  },
  logoutButton: {
    padding: '8px 16px',
    backgroundColor: 'transparent',
    border: '1px solid #ddd',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#333',
    transition: 'background-color 0.2s',
  },
};

export default Header;