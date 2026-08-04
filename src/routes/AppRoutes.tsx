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
import { AnomalyReportsPage } from '@/pages/AnomalyReportsPage';
import { FeedbackLogReportPage } from '@/pages/FeedbackLogReportPage';
import {
  ActiveEventsDetailPage,
  EventLifecyclePage,
  ClearRateAnalyticsPage,
  CategoryBreakdownDetailPage,
  LiveStatusDetailPage,
  TaxonomySignaturesDetailPage,
  AnalysisReportPage,
} from '@/pages/anomaly-details';


import { DetectionTimelinePage, LiveStreamPage } from '@/pages/anomaly-streams';
import {
  BusinessImpactMetricPage,
  EngineeringConfidenceMetricPage,
  FalseNegativesMetricPage,
  FalsePositivesMetricPage,
  LatencySlaMetricPage,
  PredictionHorizonMetricPage,
  RecommendationAcceptanceMetricPage,
} from '@/pages/anomaly-metrics';
import { PredictiveMaintenancePage } from '@/pages/PredictiveMaintenancePage';
import { PreventiveMaintenancePage } from '@/pages/PreventiveMaintenancePage';
import { PrescriptiveMaintenancePage } from '@/pages/PrescriptiveMaintenancePage';
import { ApmPage } from '@/pages/ApmPage';
import {
  ApmAssetsPage,
  ApmAvailabilityPage,
  ApmCostPage,
  ApmCriticalityPage,
  ApmHealthPage,
  ApmMaintenancePage,
  ApmReliabilityPage,
  ApmReportsPage,
  ApmWorkOrdersPage,
} from '@/pages/apm';
import { OeePage } from '@/pages/OeePage';
import { HistoricalReportsPage } from '@/pages/HistoricalReportsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { AlertsPage } from '@/pages/AlertsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { WelcomeScreen } from '@/pages/WelcomeScreen';

// OEE Module Pages
import { FleetAnalyticsPage } from '@/pages/oee/FleetAnalyticsPage';
import { ProductAnalyticsPage } from '@/pages/oee/ProductAnalyticsPage';
import { OeeReportsPage } from '@/pages/oee/OeeReportsPage';

export const AppRoutes = () => (
  <Routes>
    <Route path={PATHS.branding} element={<BrandingScreen />} />

    {/* Authentication is bypassed; the former sign-in route now lands on the
        dashboard so any existing bookmark still resolves somewhere useful. */}
    <Route path="/login" element={<Navigate to={PATHS.workspace} replace />} />

    <Route element={<ProtectedRoute />}>
      <Route path="/app" element={<AppShell />}>
        {/* The workspace opens empty. A module is chosen, not assumed. */}
        <Route index element={<WelcomeScreen />} />

        <Route path="cockpit" element={<CockpitPage />} />
        {/* Legacy path from the pre-cockpit build. */}
        <Route path="overview" element={<Navigate to={PATHS.cockpit} replace />} />

        <Route path="devices" element={<DevicesPage />} />
        <Route path="devices/:assetId" element={<DeviceDetailPage />} />
        <Route path="live-telemetry" element={<LiveTelemetryPage />} />

        <Route path="anomaly-detection" element={<AnomalyDetectionPage />} />


        {/* Legacy Drill-downs. */}
        <Route path="anomaly-detection/details/live-status" element={<LiveStatusDetailPage />} />
        <Route path="anomaly-detection/details/active-events" element={<ActiveEventsDetailPage />} />
        <Route path="anomaly-detection/details/event-lifecycle" element={<EventLifecyclePage />} />
        <Route path="anomaly-detection/details/clear-rate" element={<ClearRateAnalyticsPage />} />
        <Route
          path="anomaly-detection/details/category-breakdown"
          element={<CategoryBreakdownDetailPage />}
        />
        <Route
          path="anomaly-detection/details/taxonomy-signatures"
          element={<TaxonomySignaturesDetailPage />}
        />
        <Route path="anomaly-detection/analysis-report" element={<AnalysisReportPage />} />
        {/* Stream analytics, opened from the two entry cards on the module
            overview. Siblings rather than children because each replaces the
            module view rather than rendering inside it. */}
        <Route path="anomaly-detection/detection-timeline" element={<DetectionTimelinePage />} />
        <Route path="anomaly-detection/live-stream" element={<LiveStreamPage />} />

        {/* The module's own report surface — the journal with its taxonomy,
            exportable. Distinct from Historical Reports, which browses several
            archived record sets at daily resolution. */}
        <Route path="anomaly-detection/reports" element={<AnomalyReportsPage />} />
        {/* Declared after the parent so the more specific path is unambiguous.
            This is the engineer-judgement surface — the only place a false alarm
            can be flagged — which is why it is a page and not an embedded table. */}
        <Route path="anomaly-detection/reports/feedback" element={<FeedbackLogReportPage />} />

        {/* Detection-quality drill-downs, one per KPI tile. */}
        <Route
          path="anomaly-detection/metrics/false-positives"
          element={<FalsePositivesMetricPage />}
        />
        <Route
          path="anomaly-detection/metrics/false-negatives"
          element={<FalseNegativesMetricPage />}
        />
        <Route path="anomaly-detection/metrics/latency-sla" element={<LatencySlaMetricPage />} />
        <Route
          path="anomaly-detection/metrics/prediction-horizon"
          element={<PredictionHorizonMetricPage />}
        />
        <Route
          path="anomaly-detection/metrics/recommendation-acceptance"
          element={<RecommendationAcceptanceMetricPage />}
        />
        <Route
          path="anomaly-detection/metrics/business-impact"
          element={<BusinessImpactMetricPage />}
        />
        <Route
          path="anomaly-detection/metrics/engineering-confidence"
          element={<EngineeringConfidenceMetricPage />}
        />

        {/* Short aliases for the seven metric pages, one level up from
            /metrics. Redirects rather than second mount points: two routes
            rendering the same page would give the same analysis two canonical
            URLs, and the sidebar highlight already resolves by prefix. */}
        <Route
          path="anomaly-detection/false-positive"
          element={<Navigate to={PATHS.metricFalsePositives} replace />}
        />
        <Route
          path="anomaly-detection/false-negative"
          element={<Navigate to={PATHS.metricFalseNegatives} replace />}
        />
        <Route
          path="anomaly-detection/detection-latency"
          element={<Navigate to={PATHS.metricLatencySla} replace />}
        />
        <Route
          path="anomaly-detection/prediction-horizon"
          element={<Navigate to={PATHS.metricPredictionHorizon} replace />}
        />
        <Route
          path="anomaly-detection/recommendation-acceptance"
          element={<Navigate to={PATHS.metricRecommendationAcceptance} replace />}
        />
        <Route
          path="anomaly-detection/business-impact"
          element={<Navigate to={PATHS.metricBusinessImpact} replace />}
        />
        <Route
          path="anomaly-detection/engineering-confidence"
          element={<Navigate to={PATHS.metricEngineeringConfidence} replace />}
        />

        {/* A bare /details or /metrics is not a page — send it back to the module. */}
        <Route
          path="anomaly-detection/details"
          element={<Navigate to={PATHS.anomaly} replace />}
        />
        <Route
          path="anomaly-detection/metrics"
          element={<Navigate to={PATHS.anomaly} replace />}
        />

        <Route path="predictive-maintenance" element={<PredictiveMaintenancePage />} />
        <Route path="preventive-maintenance" element={<PreventiveMaintenancePage />} />
        <Route path="prescriptive-maintenance" element={<PrescriptiveMaintenancePage />} />
        
        {/* APM Module routes */}
        <Route path="asset-performance" element={<ApmPage />} />
        <Route path="asset-performance/dashboard" element={<ApmPage />} />
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
        <Route path="oee/fleet-analytics" element={<FleetAnalyticsPage />} />
        <Route path="oee/product-analytics" element={<ProductAnalyticsPage />} />
        <Route path="oee/reports" element={<OeeReportsPage />} />

        <Route path="historical-reports" element={<HistoricalReportsPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Route>

    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);
