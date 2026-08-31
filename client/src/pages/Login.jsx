import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { ShieldCheck, Route as RouteIcon, MapPin } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Demo credentials per CONTRACTS §14 (password demo123 for every seeded user).
const DEMO_LOGINS = [
  { role: 'Admin', email: 'admin@shiftguard.io', password: 'demo123' },
  { role: 'Vendor', email: 'vendor@saitravels.io', password: 'demo123' },
  { role: 'Driver', email: 'driver1@saitravels.io', password: 'demo123' },
  { role: 'Employee', email: 'emp1@corp.io', password: 'demo123' },
];

const ROLE_HOME = {
  admin: '/admin',
  vendor: '/vendor',
  driver: '/driver',
  employee: '/employee',
};

export default function Login() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    const from = location.state?.from;
    return <Navigate to={from || ROLE_HOME[user.role] || '/login'} replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const loggedInUser = await login(email, password);
      navigate(ROLE_HOME[loggedInUser.role] || '/login', { replace: true });
    } catch (err) {
      setError(err?.response?.data?.error || 'Unable to sign in. Check your credentials.');
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemo(demo) {
    setEmail(demo.email);
    setPassword(demo.password);
    setError('');
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-900 p-10 text-white lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 text-lg font-bold">
            SG
          </div>
          <span className="text-xl font-semibold">ShiftGuard</span>
        </div>

        <div className="space-y-6">
          <h2 className="text-3xl font-semibold leading-tight">
            Corporate commutes, optimized end to end.
          </h2>
          <ul className="space-y-4 text-indigo-100">
            <li className="flex items-center gap-3">
              <RouteIcon className="h-5 w-5" />
              <span>Optimized fleets</span>
            </li>
            <li className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5" />
              <span>Night-safe routing</span>
            </li>
            <li className="flex items-center gap-3">
              <MapPin className="h-5 w-5" />
              <span>Verified pickups</span>
            </li>
          </ul>
        </div>

        <p className="text-xs text-indigo-200">Cabmatic · demo environment</p>
      </div>

      <div className="flex items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Use your ShiftGuard account to continue.</p>

          <div className="mt-6 flex flex-wrap gap-2">
            {DEMO_LOGINS.map((demo) => (
              <button
                key={demo.role}
                type="button"
                onClick={() => fillDemo(demo)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
              >
                {demo.role}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="you@company.io"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="••••••••"
              />
            </div>

            {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
