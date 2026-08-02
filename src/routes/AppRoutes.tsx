import { Navigate, Route, Routes } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { BrandingScreen } from '@/pages/BrandingScreen';
import { CockpitPage } from '@/pages/CockpitPage';
import { DevicesPage } from '@/pages/DevicesPage';
import { DeviceDetailPage } from '@/pages/DeviceDetailPage';
import { LiveTelemetryPage } from '@/pages/LiveTelemetryPage';
import { AnomalyDetectionPage } from '@/pages/AnomalyDetectionPage';
import { PredictiveMaintenancePage } from '@/pages/PredictiveMaintenancePage';
import { PreventiveMaintenancePage } from '@/pages/PreventiveMaintenancePage';
import { PrescriptiveMaintenancePage } from '@/pages/PrescriptiveMaintenancePage';
import { ApmPage } from '@/pages/ApmPage';
import {
  ApmAssetsPage,
  ApmAvailabilityPage,
  ApmCostPage,
  ApmCriticalityPage,
  ApmDashboardPage,
  ApmHealthPage,
  ApmMaintenancePage,
  ApmReliabilityPage,
  ApmReportsPage,
  ApmWorkOrdersPage,
} from '@/pages/apm';
import { OeePage } from '@/pages/OeePage';
import { HistoricalReportsPage } from '@/pages/HistoricalReportsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export const AppRoutes = () => (
  <Routes>
    <Route path={PATHS.branding} element={<BrandingScreen />} />

    {/* Authentication is bypassed; the former sign-in route now lands on the
        dashboard so any existing bookmark still resolves somewhere useful. */}
    <Route path="/login" element={<Navigate to={PATHS.cockpit} replace />} />

    <Route element={<ProtectedRoute />}>
      <Route path="/app" element={<AppShell />}>
        <Route index element={<Navigate to={PATHS.cockpit} replace />} />

        <Route path="cockpit" element={<CockpitPage />} />
        {/* Legacy path from the pre-cockpit build. */}
        <Route path="overview" element={<Navigate to={PATHS.cockpit} replace />} />

        <Route path="devices" element={<DevicesPage />} />
        <Route path="devices/:assetId" element={<DeviceDetailPage />} />
        <Route path="live-telemetry" element={<LiveTelemetryPage />} />

        <Route path="anomaly-detection" element={<AnomalyDetectionPage />} />
        <Route path="predictive-maintenance" element={<PredictiveMaintenancePage />} />
        <Route path="preventive-maintenance" element={<PreventiveMaintenancePage />} />
        <Route path="prescriptive-maintenance" element={<PrescriptiveMaintenancePage />} />
        <Route path="asset-performance" element={<ApmPage />} />
        {/* The APM decision layer, served from /api/apm/*. Declared as a sibling
            rather than a child because it replaces the module view rather than
            rendering inside it. */}
        <Route path="asset-performance/dashboard" element={<ApmDashboardPage />} />
        {/* One analytics page per APM section, opened from the overview's
            "View Analytics" controls. Siblings rather than children because
            each replaces the module view rather than rendering inside it. */}
        <Route path="asset-performance/assets" element={<ApmAssetsPage />} />
        <Route path="asset-performance/reliability" element={<ApmReliabilityPage />} />
        <Route path="asset-performance/maintenance" element={<ApmMaintenancePage />} />
        <Route path="asset-performance/availability" element={<ApmAvailabilityPage />} />
        <Route path="asset-performance/health" element={<ApmHealthPage />} />
        <Route path="asset-performance/cost" element={<ApmCostPage />} />
        <Route path="asset-performance/criticality" element={<ApmCriticalityPage />} />
        <Route path="asset-performance/workorders" element={<ApmWorkOrdersPage />} />
        <Route path="asset-performance/reports" element={<ApmReportsPage />} />
        <Route path="oee" element={<OeePage />} />
        <Route path="historical-reports" element={<HistoricalReportsPage />} />

        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Route>

    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);
