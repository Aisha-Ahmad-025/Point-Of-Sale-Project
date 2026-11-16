import { Suspense, lazy, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './contexts/AuthContext';
import { Spinner } from './components/ui';
import AppLayout from './layouts/AppLayout';
import { homeFor } from './layouts/nav';
import Login from './pages/Login';
import Splash from './components/Splash';
import { loaders } from './utils/routes';

const Dashboard = lazy(loaders.dashboard); const POS = lazy(loaders.pos); const Products = lazy(loaders.products); const Categories = lazy(loaders.categories);
const Inventory = lazy(loaders.inventory); const Movements = lazy(loaders.movements); const Expiry = lazy(loaders.expiry); const Sales = lazy(loaders.sales);
const Customers = lazy(loaders.customers); const CustomerDetail = lazy(loaders.customerDetail);
const Reports = lazy(loaders.reports); const Employees = lazy(loaders.employees); const Audit = lazy(loaders.audit); const SettingsPage = lazy(loaders.settings);

function Guard({ roles, children }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-8 w-8" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}
function Home() { const { user } = useAuth(); return <Navigate to={user ? homeFor(user.role) : '/login'} replace />; }

export default function App() {
  const [phase, setPhase] = useState('splash'); // splash -> reveal (curtain lifting) -> done. The welcome screen shows on every fresh load.
  const admin = ['admin']; const both = ['admin', 'cashier'];
  return (
    <>
      {phase !== 'done' && <Splash onLeave={() => setPhase('reveal')} onDone={() => setPhase('done')} />}
      <Toaster position="top-right" toastOptions={{ style: { background: 'rgb(var(--surface))', color: 'rgb(var(--ink))', border: '1px solid rgb(var(--line))' }, duration: 3500 }} />
      {phase !== 'splash' && <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Spinner className="h-8 w-8" /></div>}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Guard><AppLayout /></Guard>}>
            <Route path="/dashboard" element={<Guard roles={admin}><Dashboard /></Guard>} />
            <Route path="/pos" element={<Guard roles={both}><POS /></Guard>} />
            <Route path="/products" element={<Guard roles={admin}><Products /></Guard>} />
            <Route path="/categories" element={<Guard roles={admin}><Categories /></Guard>} />
            <Route path="/inventory" element={<Guard roles={admin}><Inventory /></Guard>} />
            <Route path="/movements" element={<Guard roles={admin}><Movements /></Guard>} />
            <Route path="/expiry" element={<Guard roles={admin}><Expiry /></Guard>} />
            <Route path="/sales" element={<Guard roles={both}><Sales /></Guard>} />
            <Route path="/customers" element={<Guard roles={both}><Customers /></Guard>} />
            <Route path="/customers/:id" element={<Guard roles={both}><CustomerDetail /></Guard>} />
            <Route path="/reports" element={<Guard roles={admin}><Reports /></Guard>} />
            <Route path="/employees" element={<Guard roles={admin}><Employees /></Guard>} />
            <Route path="/audit" element={<Guard roles={admin}><Audit /></Guard>} />
            <Route path="/settings" element={<Guard roles={admin}><SettingsPage /></Guard>} />
          </Route>
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>}
    </>
  );
}
