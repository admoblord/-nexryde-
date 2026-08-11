import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { getToken } from '@/api';
import { Shell } from '@/layout/Shell';
const LoginPage = lazy(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const OpsCenterPage = lazy(() => import('@/pages/OpsCenterPage').then((m) => ({ default: m.OpsCenterPage })));
const DriverApprovalPage = lazy(() => import('@/pages/DriverApprovalPage').then((m) => ({ default: m.DriverApprovalPage })));
const DriversPage = lazy(() => import('@/pages/UsersTripsPages').then((m) => ({ default: m.DriversPage })));
const RidersPage = lazy(() => import('@/pages/UsersTripsPages').then((m) => ({ default: m.RidersPage })));
const TripsPage = lazy(() => import('@/pages/UsersTripsPages').then((m) => ({ default: m.TripsPage })));
const LiveMapPage = lazy(() => import('@/pages/LiveMapPage').then((m) => ({ default: m.LiveMapPage })));
const DriverDetailsPage = lazy(() => import('@/pages/DriverDetailsPage').then((m) => ({ default: m.DriverDetailsPage })));
const RiderDetailsPage = lazy(() => import('@/pages/RiderDetailsPage').then((m) => ({ default: m.RiderDetailsPage })));
const TripDetailsPage = lazy(() => import('@/pages/TripDetailsPage').then((m) => ({ default: m.TripDetailsPage })));
const MapsUsagePage = lazy(() => import('@/pages/MapsUsagePage').then((m) => ({ default: m.MapsUsagePage })));
const AnalyticsPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.AnalyticsPage })));
const SubscriptionIntelPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.SubscriptionIntelPage })));
const SystemHealthPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.SystemHealthPage })));
const AuditLogsPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.AuditLogsPage })));
const AnnouncementsPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.AnnouncementsPage })));
const DispatchPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.DispatchPage })));
const DriversLivePage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.DriversLivePage })));
const KpiPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.KpiPage })));
const FeatureFlagsPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.FeatureFlagsPage })));
const FinancePage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.FinancePage })));
const SubscriptionsPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.SubscriptionsPage })));
const SupportPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.SupportPage })));
const SafetyPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.SafetyPage })));
const FraudPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.FraudPage })));
const NotificationsPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.NotificationsPage })));
const PromotionsPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.PromotionsPage })));
const SettingsPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.SettingsPage })));
const WorkZonesPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.WorkZonesPage })));
const ExportPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.ExportPage })));
const DeveloperPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.DeveloperPage })));
const MarketingPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.MarketingPage })));
const GeoPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.GeoPage })));
const SurgePage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.SurgePage })));
const VehiclesPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.VehiclesPage })));
const ContentPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.ContentPage })));
const ReleasesPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.ReleasesPage })));
const SystemAuditPage = lazy(() => import('@/pages/MorePages').then((m) => ({ default: m.SystemAuditPage })));

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm font-semibold text-slate-400">
      Loading operations view...
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAuth><Shell /></RequireAuth>}>
          <Route index element={<DashboardPage />} />
          <Route path="ops" element={<OpsCenterPage />} />
          <Route path="map" element={<LiveMapPage />} />
          <Route path="dispatch" element={<DispatchPage />} />
          <Route path="drivers-live" element={<DriversLivePage />} />
          <Route path="drivers" element={<DriversPage />} />
          <Route path="drivers/:driverId" element={<DriverDetailsPage />} />
          <Route path="driver-approval" element={<DriverApprovalPage />} />
          <Route path="riders" element={<RidersPage />} />
          <Route path="riders/:riderId" element={<RiderDetailsPage />} />
          <Route path="trips" element={<TripsPage />} />
          <Route path="trips/:tripId" element={<TripDetailsPage />} />
          <Route path="work-zones" element={<WorkZonesPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="subscriptions" element={<SubscriptionsPage />} />
          <Route path="subscription-intelligence" element={<SubscriptionIntelPage />} />
          <Route path="support" element={<SupportPage />} />
          <Route path="safety" element={<SafetyPage />} />
          <Route path="fraud" element={<FraudPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
          <Route path="promotions" element={<PromotionsPage />} />
          <Route path="marketing" element={<MarketingPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="kpi" element={<KpiPage />} />
          <Route path="geo" element={<GeoPage />} />
          <Route path="surge" element={<SurgePage />} />
          <Route path="vehicles" element={<VehiclesPage />} />
          <Route path="content" element={<ContentPage />} />
          <Route path="releases" element={<ReleasesPage />} />
          <Route path="feature-flags" element={<FeatureFlagsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="system-health" element={<SystemHealthPage />} />
          <Route path="audit-logs" element={<AuditLogsPage />} />
          <Route path="system-audit" element={<SystemAuditPage />} />
          <Route path="developer" element={<DeveloperPage />} />
          <Route path="maps-usage" element={<MapsUsagePage />} />
          <Route path="export" element={<ExportPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
