import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/admin/Dashboard';
import Employees from './pages/admin/Employees';
import Services from './pages/admin/Services';
import Payments from './pages/admin/Payments';
import Clients from './pages/admin/Clients';
import EmpleadaDashboard from './pages/empleada/EmpleadaDashboard';
import Profile from './pages/empleada/Profile';

function ProtectedRoute({ children, role }) {
  const { user, userData, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>;
  if (!user) return <Navigate to="/" />;
  if (role && userData?.rol !== role) return <Navigate to="/" />;
  return children;
}

function AppRoutes() {
  const { user, userData, loading } = useAuth();

  if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>;

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to={userData?.rol === 'admin' ? '/admin' : '/empleada'} /> : <Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/admin" element={<ProtectedRoute role="admin"><Layout role="admin" /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="empleadas" element={<Employees />} />
        <Route path="servicios" element={<Services />} />
        <Route path="pagos" element={<Payments />} />
        <Route path="clientes" element={<Clients />} />
      </Route>
      <Route path="/empleada" element={<ProtectedRoute role="empleada"><Layout role="empleada" /></ProtectedRoute>}>
        <Route index element={<EmpleadaDashboard />} />
        <Route path="perfil" element={<Profile />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
