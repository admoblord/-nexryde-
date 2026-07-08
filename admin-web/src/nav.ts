import {
  Activity, BarChart3, Bell, Car, CreditCard, FileText, Flag, Gauge,
  Globe, Headphones, LayoutDashboard, Map, Megaphone, Radio, Settings,
  Shield, Truck, Users, Wallet, Wrench, Zap,
} from 'lucide-react';

export type AdminRole =
  | 'super_admin'
  | 'operations_manager'
  | 'finance_manager'
  | 'support_agent'
  | 'verification_officer'
  | 'marketing_manager'
  | 'analytics_viewer'
  | 'read_only';

export type NavItem = {
  id: string;
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  section?: string;
  roles?: AdminRole[];
};

export const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard, section: 'Overview' },
  { id: 'ops', label: 'Live Operations', path: '/ops', icon: Radio, section: 'Overview' },
  { id: 'map', label: 'Live Map', path: '/map', icon: Map, section: 'Overview' },
  { id: 'dispatch', label: 'Dispatch Control', path: '/dispatch', icon: Zap, section: 'Operations' },
  { id: 'drivers-live', label: 'Driver Live Status', path: '/drivers-live', icon: Activity, section: 'Operations' },
  { id: 'drivers', label: 'Drivers', path: '/drivers', icon: Truck, section: 'Users' },
  { id: 'driver-approval', label: 'Driver Approval', path: '/driver-approval', icon: Shield, section: 'Users' },
  { id: 'riders', label: 'Riders', path: '/riders', icon: Users, section: 'Users' },
  { id: 'trips', label: 'Trips', path: '/trips', icon: Car, section: 'Trips' },
  { id: 'work-zones', label: 'Work Zones', path: '/work-zones', icon: Globe, section: 'Operations' },
  { id: 'finance', label: 'Wallet & Finance', path: '/finance', icon: Wallet, section: 'Finance' },
  { id: 'subscriptions', label: 'Subscriptions', path: '/subscriptions', icon: CreditCard, section: 'Finance' },
  { id: 'sub-intel', label: 'Subscription Intel', path: '/subscription-intelligence', icon: Gauge, section: 'Finance' },
  { id: 'withdrawals', label: 'Withdrawals', path: '/withdrawals', icon: Wallet, section: 'Finance' },
  { id: 'support', label: 'Support Center', path: '/support', icon: Headphones, section: 'Support' },
  { id: 'safety', label: 'Safety Center', path: '/safety', icon: Shield, section: 'Support' },
  { id: 'fraud', label: 'Fraud & Security', path: '/fraud', icon: Flag, section: 'Support' },
  { id: 'notifications', label: 'Notifications', path: '/notifications', icon: Bell, section: 'Comms' },
  { id: 'announcements', label: 'Announcements', path: '/announcements', icon: Megaphone, section: 'Comms' },
  { id: 'promotions', label: 'Promotions', path: '/promotions', icon: Zap, section: 'Growth' },
  { id: 'marketing', label: 'Marketing & Referrals', path: '/marketing', icon: BarChart3, section: 'Growth' },
  { id: 'analytics', label: 'Analytics', path: '/analytics', icon: BarChart3, section: 'Insights' },
  { id: 'maps-usage', label: 'Maps API Usage', path: '/maps-usage', icon: Globe, section: 'Insights' },
  { id: 'kpi', label: 'KPI Scoreboard', path: '/kpi', icon: Gauge, section: 'Insights' },
  { id: 'geo', label: 'Geo Management', path: '/geo', icon: Globe, section: 'Config' },
  { id: 'surge', label: 'Surge Pricing', path: '/surge', icon: Zap, section: 'Config' },
  { id: 'vehicles', label: 'Vehicles', path: '/vehicles', icon: Car, section: 'Config' },
  { id: 'content', label: 'Content CMS', path: '/content', icon: FileText, section: 'Config' },
  { id: 'releases', label: 'Release Mgmt', path: '/releases', icon: Wrench, section: 'Config' },
  { id: 'flags', label: 'Feature Flags', path: '/feature-flags', icon: Flag, section: 'Config' },
  { id: 'settings', label: 'Settings', path: '/settings', icon: Settings, section: 'System' },
  { id: 'health', label: 'System Health', path: '/system-health', icon: Activity, section: 'System' },
  { id: 'audit', label: 'Audit Logs', path: '/audit-logs', icon: FileText, section: 'System' },
  { id: 'sys-audit', label: 'System Audit', path: '/system-audit', icon: Activity, section: 'System' },
  { id: 'dev', label: 'Developer Tools', path: '/developer', icon: Wrench, section: 'System' },
  { id: 'export', label: 'Data Export', path: '/export', icon: FileText, section: 'System' },
];
