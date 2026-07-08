import { Navigate, Route, Routes } from 'react-router-dom';
import { getToken } from '@/api';
import { Shell } from '@/layout/Shell';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { OpsCenterPage } from '@/pages/OpsCenterPage';
import { DriverApprovalPage } from '@/pages/DriverApprovalPage';
import { DriversPage, RidersPage, TripsPage } from '@/pages/UsersTripsPages';
import {
  AnalyticsPage, SubscriptionIntelPage, WithdrawalsPage, SystemHealthPage,
  AuditLogsPage, AnnouncementsPage, DispatchPage, DriversLivePage, KpiPage,
  FeatureFlagsPage, FinancePage, SubscriptionsPage,
  SupportPage, SafetyPage, FraudPage, NotificationsPage, PromotionsPage,
  SettingsPage, WorkZonesPage, ExportPage, DeveloperPage,
  MarketingPage, GeoPage, SurgePage, VehiclesPage, ContentPage, ReleasesPage, SystemAuditPage,
} from '@/pages/MorePages';
import { LiveMapPage } from '@/pages/LiveMapPage';
import { DriverDetailsPage } from '@/pages/DriverDetailsPage';
import { RiderDetailsPage } from '@/pages/RiderDetailsPage';
import { TripDetailsPage } from '@/pages/TripDetailsPage';
import { MapsUsagePage } from '@/pages/MapsUsagePage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
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
        <Route path="withdrawals" element={<WithdrawalsPage />} />
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
  );
}
