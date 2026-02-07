import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { Layout } from './components/common/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Register } from './pages/Register';
import { PatientList } from './pages/PatientList';
import { PatientDetail } from './pages/PatientDetail';
import { PatientIdCard } from './pages/PatientIdCard';
import { UserManagement } from './pages/UserManagement';
import { Profile } from './pages/Profile';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/register"
            element={
              <ProtectedRoute>
                <Layout>
                  <Register />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/patients"
            element={
              <ProtectedRoute>
                <Layout>
                  <PatientList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/patients/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <PatientDetail />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/patients/:id/id-card"
            element={
              <ProtectedRoute>
                <Layout>
                  <PatientIdCard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/user-management"
            element={
              <ProtectedRoute>
                <Layout>
                  <UserManagement />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Layout>
                  <Profile />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route path="/change-password" element={<Navigate to="/profile" replace />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
