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
import {
  ActiveEventsDetailPage,
  CategoryBreakdownDetailPage,
  LiveStatusDetailPage,
  TaxonomySignaturesDetailPage,
} from '@/pages/anomaly-details';
import { PredictiveMaintenancePage } from '@/pages/PredictiveMaintenancePage';
import { PreventiveMaintenancePage } from '@/pages/PreventiveMaintenancePage';
import { PrescriptiveMaintenancePage } from '@/pages/PrescriptiveMaintenancePage';
import { ApmPage } from '@/pages/ApmPage';
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
        {/* Drill-downs from the module's status bar. Nested under the module
            path so the sidebar keeps Anomaly Detection highlighted, and declared
            as siblings rather than children because each replaces the module
            view rather than rendering inside it. */}
        <Route path="anomaly-detection/details/live-status" element={<LiveStatusDetailPage />} />
        <Route path="anomaly-detection/details/active-events" element={<ActiveEventsDetailPage />} />
        <Route
          path="anomaly-detection/details/category-breakdown"
          element={<CategoryBreakdownDetailPage />}
        />
        <Route
          path="anomaly-detection/details/taxonomy-signatures"
          element={<TaxonomySignaturesDetailPage />}
        />
        {/* A bare /details is not a page — send it back to the module. */}
        <Route
          path="anomaly-detection/details"
          element={<Navigate to={PATHS.anomaly} replace />}
        />

        <Route path="predictive-maintenance" element={<PredictiveMaintenancePage />} />
        <Route path="preventive-maintenance" element={<PreventiveMaintenancePage />} />
        <Route path="prescriptive-maintenance" element={<PrescriptiveMaintenancePage />} />
        <Route path="asset-performance" element={<ApmPage />} />
        <Route path="oee" element={<OeePage />} />
        <Route path="historical-reports" element={<HistoricalReportsPage />} />

        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Route>

    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);
