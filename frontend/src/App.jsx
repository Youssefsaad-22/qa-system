import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './components/Login';
import QAWorkerScreen from './components/QAWorkerScreen';
import SupervisorScreen from './components/SupervisorScreen';
import AgentsScreen from './components/AgentsScreen';
import HistoryScreen from './components/HistoryScreen';
import WorkerSummaryScreen from './components/WorkerSummaryScreen';
import AccountScreen from './components/AccountScreen';
import Header from './components/Header';

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  const { user } = useAuth();

  return (
    <div style={styles.app}>
      {user && <Header />}
      <main style={styles.main}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute allowedRoles={['QA_WORKER', 'SUPERVISOR']}>
                <QAWorkerScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/supervisor"
            element={
              <ProtectedRoute allowedRoles={['SUPERVISOR']}>
                <SupervisorScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/worker-summary"
            element={
              <ProtectedRoute allowedRoles={['SUPERVISOR']}>
                <WorkerSummaryScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/agents"
            element={
              <ProtectedRoute allowedRoles={['QA_WORKER', 'SUPERVISOR']}>
                <AgentsScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute allowedRoles={['QA_WORKER', 'SUPERVISOR']}>
                <HistoryScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/account"
            element={
              <ProtectedRoute allowedRoles={['QA_WORKER', 'SUPERVISOR']}>
                <AccountScreen />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

const styles = {
  app: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
  },
  main: {
    flex: 1,
    padding: '24px',
    maxWidth: '1200px',
    width: '100%',
    margin: '0 auto',
    boxSizing: 'border-box',
  },
};

export default App;