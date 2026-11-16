// Route code-splitting loaders. Calling a loader early (on hover/focus/touch/idle) downloads the page's JS before the click,
// so navigation feels instant. `lazy(loader)` and `prefetchRoute` share the same module promise.
export const loaders = {
  dashboard: () => import('../pages/Dashboard.jsx'),
  pos: () => import('../pages/POS.jsx'),
  products: () => import('../pages/Products.jsx'),
  categories: () => import('../pages/Categories.jsx'),
  inventory: () => import('../pages/Inventory.jsx'),
  movements: () => import('../pages/Movements.jsx'),
  expiry: () => import('../pages/Expiry.jsx'),
  sales: () => import('../pages/Sales.jsx'),
  customers: () => import('../pages/Customers.jsx'),
  customerDetail: () => import('../pages/CustomerDetail.jsx'),
  reports: () => import('../pages/Reports.jsx'),
  employees: () => import('../pages/Employees.jsx'),
  audit: () => import('../pages/Audit.jsx'),
  settings: () => import('../pages/SettingsPage.jsx'),
};

const BY_PATH = { '/dashboard': 'dashboard', '/pos': 'pos', '/products': 'products', '/categories': 'categories', '/inventory': 'inventory', '/movements': 'movements', '/expiry': 'expiry', '/sales': 'sales', '/customers': 'customers', '/reports': 'reports', '/employees': 'employees', '/audit': 'audit', '/settings': 'settings' };
const done = new Set();

/** Start downloading the chunk for a route (safe to call repeatedly). Returns true if a download was started. */
export function prefetchRoute(path) {
  const key = BY_PATH[String(path).split('?')[0]];
  if (!key || done.has(key)) return false;
  done.add(key);
  loaders[key]().catch(() => done.delete(key)); // allow a retry if the network failed
  if (key === 'customers') { done.add('customerDetail'); loaders.customerDetail().catch(() => done.delete('customerDetail')); }
  return true;
}

/** After sign-in, warm the pages people open most while the browser is idle. */
export function prefetchLikelyRoutes(paths = ['/pos', '/sales', '/customers']) {
  const run = () => paths.forEach((p) => prefetchRoute(p));
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}
