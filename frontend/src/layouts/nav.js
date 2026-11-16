import { LayoutDashboard, ShoppingCart, Package, Tags, Boxes, ArrowLeftRight, CalendarClock, Receipt, BarChart3, Users, ScrollText, Settings, BookUser } from 'lucide-react';

export const NAV = [
  { path: '/dashboard', key: 'dashboard', icon: LayoutDashboard, roles: ['admin'], group: 'overview' },
  { path: '/pos', key: 'pos', icon: ShoppingCart, roles: ['admin', 'cashier'], group: 'sell' },
  { path: '/sales', key: 'sales', icon: Receipt, roles: ['admin', 'cashier'], group: 'sell' },
  { path: '/customers', key: 'customers', icon: BookUser, roles: ['admin', 'cashier'], group: 'sell' },
  { path: '/products', key: 'products', icon: Package, roles: ['admin'], group: 'stock' },
  { path: '/categories', key: 'categories', icon: Tags, roles: ['admin'], group: 'stock' },
  { path: '/inventory', key: 'inventory', icon: Boxes, roles: ['admin'], group: 'stock' },
  { path: '/movements', key: 'movements', icon: ArrowLeftRight, roles: ['admin'], group: 'stock' },
  { path: '/expiry', key: 'expiry', icon: CalendarClock, roles: ['admin'], group: 'stock' },
  { path: '/reports', key: 'reports', icon: BarChart3, roles: ['admin'], group: 'insights' },
  { path: '/employees', key: 'employees', icon: Users, roles: ['admin'], group: 'admin' },
  { path: '/audit', key: 'audit', icon: ScrollText, roles: ['admin'], group: 'admin' },
  { path: '/settings', key: 'settings', icon: Settings, roles: ['admin'], group: 'admin' },
];
export const GROUPS = ['overview', 'sell', 'stock', 'insights', 'admin'];
export const homeFor = (role) => (role === 'admin' ? '/dashboard' : '/pos');
