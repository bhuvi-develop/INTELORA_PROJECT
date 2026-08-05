# Module Overview
The AI Anomaly Detection module (centered around `AnomalyDetectionPage.tsx`) presents a real-time dashboard of anomalies raised by the edge AI engine when live readings breach device profile thresholds. It is built to categorize, drill down into, and act on these failures with views for taxonomy, failure classification, detection quality, and stream visualization.

# UI Overview
The UI provides a three-part drill-down structure:
1. Status Bar (`TaxonomyStatusBar`): 4 main navigation cards for System Online, Active Events, Electrical Faults, and Signature Analytics.
2. Failure Classification (`FailureClassification`): A pie chart classifying failures and listing faults with their taxonomy rules.
3. Detection Quality Grid (`DetectionQualityGrid`): 7 key metrics (false positives, false negatives, latency, etc.) represented as cards.
4. Stream Navigation Grid (`StreamNavGrid`): Links to Detection Timeline and Live Stream views.

# Navigation Flow
- The main entry point is `AnomalyDetectionPage`.
- Top-level `PageHeader` routes to `Analysis Report`.
- `TaxonomyStatusBar` navigates to different pages (`anomalyLiveStatus`, `anomalyActiveEvents`, `anomalyCategoryBreakdown`, `anomalyTaxonomySignatures`).
- `DetectionQualityGrid` routes to specific metric drill-downs (false positives, negatives, latency, horizon, adoption, impact, confidence).
- `StreamNavGrid` navigates to `anomalyDetectionTimeline` and `anomalyLiveStream`.
- `TaxonomyReference` acts as a modal overlay instead of a distinct page route.

# Component Breakdown
- `AnomalyDetectionPage`: The main container managing stats, drill-down chips, and rendering the page blocks.
- `useAnomalyModule`: Main hook holding local state (category selection, severity, failure type, flags) and deriving heavy aggregations (taxonomy breakdown, detection quality metrics, status checks).
- `TaxonomyStatusBar`: Contains 4 large navigation cards.
- `FailureClassification`: Recharts pie chart to select fault classes, lists signatures within classes.
- `DetectionQualityGrid`: Renders 7 metric cards linked to detailed metric pages.
- `StreamNavGrid`: Navigates to stream details and timeline pages.
- `TaxonomyReference`: A modal table outlining M01-M15 failure modes and rules.
- `EventDetailDrawer`: Detailed view for a single anomaly record (raw trace, parameter contribution, severity info).

# UI Components
- Recharts (`PieChart`, `Pie`, `Cell`, `Tooltip`, `ResponsiveContainer`)
- Custom UI components: `Card`, `Button`, `Badge`, `Modal`, `Segmented`, `EmptyState`, `LineTrend`
- Icons from `lucide-react` (Radar, ShieldAlert, etc.)

# Business Logic
The module relies heavily on device-specific bounds. Business rules include:
- Failures are classified into 6 classes: Electrical, Thermal, Degradation, Grid Transients, Communication, Mechanical.
- There are 15 specific fault signatures (M01 to M15) with strict logical rules based on parameters like voltage, current, power, temperature.
- Cost model assumption: $45/hour downtime rate, $320 unit replacement cost.
- Metrics are calculated: Precision, Recall, Latency, Horizon, Adoption, Impact, Confidence.

# Detection Logic
Defined in `taxonomy.ts`:
- Uses rule objects mapping expressions to telemetry channels (e.g., M01 Voltage Surge: `V_rms > V_nom·(1 + tol) for ≥ 6 s, breach ≥ 8%`).
- Evaluates `breachRatio`, `isTransient` (cleared within 60s), and `openMs`.
- The `classifyRecord` function applies rules deterministically.

# Data Flow
Data flows from the centralized stores (`useSnapshot`, `useAnomalyJournal`, `useAssetList`, `useConnection` via `src/engine/store`) into `useAnomalyModule`, where it is parsed, filtered, and aggregated.
The state inside `useAnomalyModule` acts as a local filter (drill-down). Aggregated metrics (taxonomy, quality, status) are passed down to child UI components as props. No state mutations are fed back to the engine except explicit 'acknowledge' actions.

# API Integration
No direct backend fetches are made within these files; it relies entirely on the global store/engine (`useAnomalyJournal`, `useSnapshot`, `useConnection`). The only upstream interaction mentioned is marking events as acknowledged.

# State Management
State is managed locally in `AnomalyDetectionPage` via the `useAnomalyModule` custom hook.
State includes:
- `selectedCategory`: Filter by Fault Class.
- `selectedSeverity`: Filter by Severity.
- `activeFailureTypeId`: Filter by M-Rule signature.
- `classifiedOnly`: Boolean.
- `isTaxonomyModalOpen`: Boolean.
- `falseAlarms`: Set of strings for ignored alerts.

# Charts
- Donut chart in `FailureClassification` (using `Recharts`) to visualize unresolved event distribution by fault class.
- `LineTrend` in `EventDetailDrawer` to display the raw channel trace (1 Hz stream) around the anomaly event.

# Tables
- Taxonomy Reference table (`TaxonomyReference` modal) showing ID, Failure mode, Class, Condition, Dwell, Clear, Open counts.

# User Workflow
1. User lands on Anomaly Detection page. Sees active event stats and navigation cards.
2. Clicks on a fault class pie slice in `FailureClassification` to filter down.
3. Drill-down chips appear at the top. The rest of the page (including the calculated detection quality) recalculates for the filtered scope.
4. User can open the taxonomy reference to learn about rules.
5. User can view specific metrics via the Quality Grid cards, or jump into timeline/stream views via the Stream Nav Grid.

# Folder Structure
- `src/pages/AnomalyDetectionPage.tsx`: Main entry point.
- `src/components/anomaly/`:
  - `useAnomalyModule.ts`: Logic and data transformations.
  - `taxonomy.ts`: M-Rules, fault classes, constants.
  - `metricCatalog.ts`: Definitions for the 7 detection quality metrics.
  - Component files (`FailureClassification.tsx`, `DetectionQualityGrid.tsx`, `TaxonomyReference.tsx`, `StreamNavGrid.tsx`, `EventDetailDrawer.tsx`, `TaxonomyStatusBar.tsx`).

# File Explanation
- `AnomalyDetectionPage.tsx`: Assembles the page layout.
- `useAnomalyModule.ts`: Heavy logic hook to compute `status`, `taxonomy`, `quality`, `signal`.
- `taxonomy.ts`: Hardcoded rules (M01-M15), sensor limits, fault classes, logic to map record to a rule.
- `metricCatalog.ts`: Configurations and verbose text for the detection KPI cards (formula, explainer, sub-stats).
- `DetectionQualityGrid.tsx`: Grid of 7 route cards.
- `FailureClassification.tsx`: Interactive pie chart for fault class drill-down.
- `TaxonomyReference.tsx`: Modal displaying all rules and currently open counts.
- `StreamNavGrid.tsx`: Cards routing to timeline and stream.
- `TaxonomyStatusBar.tsx`: Top level status navigation.
- `EventDetailDrawer.tsx`: Inspector drawer for a single anomaly record showing raw data trace.

# Design Decisions
- Separation of Logic and Presentation: `useAnomalyModule` handles all the data transformations so UI components stay pure and declarative.
- Re-use of color accents: Specific colors are tied to specific classes (e.g. #38BDF8 for Electrical) and carried consistently across the taxonomy and metrics.
- Drill-down scope: Kept entirely local. Navigating away resets the drill-down unless saved in the URL (not used here).
- "Data-rich but clean" UI: Heavy details were moved from dashboard tiles directly to dedicated drill-down pages (e.g. in DetectionQualityGrid).

# Future Improvements
- Exposing an actual API endpoint to save `falseAlarms` per session to a remote database so noise tuning persists across sessions.
- Adding URL param sync for the drill-down states (Category, Severity, FailureType) to enable shareable links to specific filtered views.
- Implement streaming line chart performance optimizations if the 90-tick array sizes grow.

# Module Summary
The AI Anomaly Detection module is a highly analytical, reactive dashboard for monitoring device failure modes. By tightly coupling raw telemetry data to a predefined taxonomy of electrical, thermal, and mechanical rules, it gives engineers precise visibility into fault causes, anomaly metrics, and system health without cluttering the screen.
