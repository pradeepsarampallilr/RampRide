import { lazy, Suspense, Component } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Spinner from './components/Spinner';
import EmptyState from './components/EmptyState';
import Login from './pages/Login';

const ROLE_HOME = {
  admin: '/admin',
  vendor: '/vendor',
  driver: '/driver',
  employee: '/employee',
};

// Portal pages (admin/vendor/driver/employee) are owned by other build threads and may not exist
// yet. import.meta.glob only picks up files present at build time — a missing portal page is
// simply absent from this map instead of failing module resolution at build time, which is what
// lets a portal that isn't built yet stay a runtime fallback instead of a build/crash failure.
const portalModules = import.meta.glob('./pages/{admin,vendor,driver,employee}/*.jsx');

function PortalNotBuilt() {
  return (
    <div className="p-6">
      <EmptyState title="Portal not built yet" body="This screen is still under construction." />
    </div>
  );
}

class PortalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    // eslint-disable-next-line no-console
    console.error('Portal failed to render:', error);
  }

  render() {
    if (this.state.hasError) return <PortalNotBuilt />;
    return this.props.children;
  }
}

function lazyPortal(relativePath) {
  const key = `./pages/${relativePath}.jsx`;
  const loader = portalModules[key];
  if (!loader) {
    return lazy(() => Promise.resolve({ default: PortalNotBuilt }));
  }
  return lazy(() => loader().catch(() => ({ default: PortalNotBuilt })));
}

function Portal({ relativePath }) {
  const Lazy = lazyPortal(relativePath);
  return (
    <PortalErrorBoundary>
      <Suspense fallback={<Spinner label="Loading…" />}>
        <Lazy />
      </Suspense>
    </PortalErrorBoundary>
  );
}

function RoleRoute({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Loading…" />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (user.role !== role) return <Navigate to={ROLE_HOME[user.role] || '/login'} replace />;
  return children;
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Loading…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={ROLE_HOME[user.role] || '/login'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />

          <Route
            path="/admin"
            element={
              <RoleRoute role="admin">
                <Portal relativePath="admin/Dashboard" />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/roster"
            element={
              <RoleRoute role="admin">
                <Portal relativePath="admin/Roster" />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/routes"
            element={
              <RoleRoute role="admin">
                <Portal relativePath="admin/RoutePlanner" />
              </RoleRoute>
            }
          />
          <Route
            path="/admin/alerts"
            element={
              <RoleRoute role="admin">
                <Portal relativePath="admin/Alerts" />
              </RoleRoute>
            }
          />

          <Route
            path="/vendor"
            element={
              <RoleRoute role="vendor">
                <Portal relativePath="vendor/FleetBoard" />
              </RoleRoute>
            }
          />
          <Route
            path="/vendor/assign"
            element={
              <RoleRoute role="vendor">
                <Portal relativePath="vendor/AssignRoutes" />
              </RoleRoute>
            }
          />

          <Route
            path="/driver"
            element={
              <RoleRoute role="driver">
                <Portal relativePath="driver/Manifest" />
              </RoleRoute>
            }
          />
          <Route
            path="/driver/trip/:routeId"
            element={
              <RoleRoute role="driver">
                <Portal relativePath="driver/TripView" />
              </RoleRoute>
            }
          />

          <Route
            path="/employee"
            element={
              <RoleRoute role="employee">
                <Portal relativePath="employee/TrackCab" />
              </RoleRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
