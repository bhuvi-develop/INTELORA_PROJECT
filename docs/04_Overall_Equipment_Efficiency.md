# Module Overview
The Overall Equipment Efficiency (OEE) module provides comprehensive operational intelligence, fleet analytics, and performance monitoring for the MIKOS Dashboard. It aggregates real-time device telemetry and key performance indicators (KPIs) to present executive summaries, detailed OEE factor breakdowns (Availability, Performance, Quality), session trends, and AI-derived insights. The module is designed to give both high-level business insights and granular device-level diagnostics.

# UI Overview
The UI is built using React and styled with Tailwind CSS, utilizing a modern, card-based layout. It features a responsive grid system (`grid-cols-1`, `md:grid-cols-2`, `lg:grid-cols-4`, etc.) to arrange various data visualization widgets. The module makes extensive use of reusable UI components such as `Card`, `Badge`, `KpiCard`, `Button`, and custom charts (from `@/components/charts`). The design language uses distinct color tones (emerald for good, rose for critical, amber for warnings) to instantly communicate system health and operational status.

# Navigation Flow
- **Main Dashboard**: The primary entry point is `OeePage`, which features a horizontal tabbed navigation bar allowing users to switch between six main sections: Executive Overview, Fleet Intelligence, OEE Analytics, Device Intelligence, Session Intelligence, and AI Intelligence.
- **Standalone Pages**: Dedicated pages like `FleetAnalyticsPage`, `ProductAnalyticsPage`, and `OeeReportsPage` are likely accessible via the application's main sidebar or top navigation, offering specialized views for business benchmarking, product categorization, and report generation respectively.
- **Drill-down**: Users can click on specific devices in the `DeviceIntelligencePanel` table to open a slide-out `DeviceProfileDrawer` for deeper analysis.

# Component Breakdown
- **Pages**:
  - `OeePage.tsx`: The main container orchestrating the tabbed panel views.
  - `FleetAnalyticsPage.tsx`: Displays business impact, revenue cost indicators, and fleet benchmarking against target and world-class OEE.
  - `ProductAnalyticsPage.tsx`: Breaks down performance metrics specifically by product categories (Laptops vs. Mobile Chargers).
  - `OeeReportsPage.tsx`: Interface for generating PDF/Excel reports and managing automated delivery schedules.
- **Panels & Drawers** (`src/components/oee/`):
  - `ExecutiveOverviewPanel.tsx`: High-level summary of fleet OEE, active sessions, and target achievements.
  - `FleetIntelligencePanel.tsx`: Focuses on runtime, downtime, utilization distribution, and fleet-wide trends.
  - `OeeAnalyticsPanel.tsx`: Detailed breakdown of Availability, Performance, and Quality factors, including historical trends and efficiency loss breakdowns.
  - `DeviceIntelligencePanel.tsx`: Identifies top/bottom performing devices and provides a comprehensive data table of all assets.
  - `SessionIntelligencePanel.tsx`: Visualizes charging volume, energy delivery trends, and peak usage via a heatmap.
  - `AiInsightsPanel.tsx`: Presents AI-generated insights, performance drivers, and detractors.
  - `DeviceProfileDrawer.tsx`: A modal drawer displaying detailed metrics and quick actions for a single selected asset.
  - `OeeDrilldownPanel.tsx`: A generic wrapper component for slide-out right-side panels.

# UI Components
The module relies on several core shared components:
- `PageHeader`: Standardized page titles and subtitles.
- `Card`: Container for grouping related metrics and charts.
- `Badge`: Used for status indicators (e.g., `tone="good"`, `tone="critical"`).
- `KpiCard`: Specialized card for displaying a primary metric, icon, and trend indicator.
- `DataTable`: Used for listing devices with sortable columns.
- `Modal`: Used as the base for the `DeviceProfileDrawer`.

# Business Logic
- **OEE Benchmarking**: The system benchmarks current fleet OEE against predefined targets (e.g., `OEE_TARGET` typically 85%, and `OEE_WORLD_CLASS` 95%).
- **Business Impact**: Calculates mock revenue impact based on OEE deviations (e.g., `(kpis.averageOee - 85) * 1250`).
- **Utilization Tiers**: Devices are categorized into Highly Utilized (>= 80%), Moderately Utilized (50-80%), and Low Utilized (< 50%) based on their performance metric.
- **Loss Analysis**: Uses `effectivenessLosses` (from `@/engine/analytics`) to calculate where OEE is being lost (Availability vs. Performance vs. Quality).

# Detection Logic
- **Session State**: Devices are considered to have an "Active Charging" session if `live.power > 0`. If `live.power === 0` but `device.status === 'Online'`, they are considered "Idle".
- **Performance Ranking**: The system dynamically sorts the asset list by `performance.oee` to identify the Top 5 performing devices and the Bottom 5 devices requiring immediate attention.

# Data Flow
Data flows unidirectionally from a central global store (`@/engine/store`).
- Components use hooks like `useAssetList`, `useFleetKpis`, and `useSnapshot` to subscribe to real-time data.
- Heavy use of `useMemo` within components to derive localized metrics (e.g., filtering laptops vs chargers, calculating category averages, sorting top/bottom performers).
- Historical trend data is currently generated dynamically on the client side using the `at` timestamp and simulated variations for demonstration purposes.

# API Integration
There are no direct HTTP API calls (like `fetch` or `axios`) made directly from within the OEE components. The module relies entirely on the `@/engine/store` hooks to provide data. This implies a clear separation of concerns where the engine/store layer handles websocket/API communication and provides a reactive state to the UI.

# State Management
- **Global State**: Handled by the `engine/store` (likely Zustand or similar), providing `assets`, `kpis`, and `snapshot` times.
- **Local State**: Managed via `useState` for UI interactions:
  - `activeSection` in `OeePage` to track the current active tab.
  - `selectedAsset` in `DeviceIntelligencePanel` to control the visibility and target of the `DeviceProfileDrawer`.
  - `isGenerating` in `OeeReportsPage` to handle button loading states during simulated report exports.

# Charts
The module utilizes a rich set of charting components from `@/components/charts`:
- `RadialGauge`: Used for individual OEE factors (Fleet OEE, Availability, Performance, Quality).
- `DonutSplit`: Visualizes Fleet Utilization and Product Distribution.
- `AreaTrend`: Shows continuous data like Fleet Trend, 12h OEE Trend, Charging Volume, and Energy Delivered.
- `LineTrend`: Displays comparative historical trends of multiple OEE factors over time.
- `WaterfallChart`: Illustrates the step-by-step breakdown of efficiency losses from Target to Actual OEE.
- `Heatmap`: Visualizes Peak Charging Hours across days of the week.
- `BarTrend`: Compares 7-day OEE trends between different product categories.

# Tables
The `DeviceIntelligencePanel` utilizes a `DataTable` component.
Columns include:
- **Device**: Displays Asset Name and ID. Clicking the name triggers the `DeviceProfileDrawer`.
- **Category**: Displays the device category using a neutral Badge.
- **Status**: Displays Online/Offline status using color-coded Badges.
- **OEE**: Features a visual progress bar indicating the percentage alongside the numerical value.
- **Current Power**: Shows live wattage with a Zap icon.

# User Workflow
1. **High-Level Monitoring**: The user enters the `OeePage` and reviews the `ExecutiveOverviewPanel` to instantly gauge if the fleet is meeting the OEE target and to read AI-generated executive summaries.
2. **Deep Dive**: The user clicks through the tabs (Fleet Intelligence, OEE Analytics) to identify trends, utilization bottlenecks, or specific loss factors (e.g., Availability vs. Performance).
3. **Troubleshooting**: Navigating to `DeviceIntelligencePanel`, the user spots a device in the "Devices Requiring Attention" list or finds it via the DataTable.
4. **Action**: The user clicks the device name, opening the `DeviceProfileDrawer` to view live power, 12h trends, and execute quick actions like "Restart Session".
5. **Reporting**: Periodically, the user visits `OeeReportsPage` to manually download PDF summaries or configure automated email schedules for stakeholders.

# Folder Structure
- `src/pages/OeePage.tsx`: The main tabbed dashboard entry point.
- `src/pages/oee/`: Contains standalone, full-page OEE views:
  - `FleetAnalyticsPage.tsx`
  - `OeeReportsPage.tsx`
  - `ProductAnalyticsPage.tsx`
- `src/components/oee/`: Contains modular panel components specifically built for the OEE dashboard:
  - `AiInsightsPanel.tsx`
  - `DeviceIntelligencePanel.tsx`
  - `DeviceProfileDrawer.tsx`
  - `ExecutiveOverviewPanel.tsx`
  - `FleetIntelligencePanel.tsx`
  - `OeeAnalyticsPanel.tsx`
  - `OeeDrilldownPanel.tsx`
  - `SessionIntelligencePanel.tsx`

# File Explanation
- **`OeePage.tsx`**: Renders the main title and the navigation tab bar, conditionally rendering the selected panel component.
- **`FleetAnalyticsPage.tsx`**: A standalone page focusing on business metrics, revenue impact, and benchmarking vs world-class standards.
- **`ProductAnalyticsPage.tsx`**: Aggregates asset data to compare Laptops vs Mobile Chargers, showing availability, performance, and trends.
- **`OeeReportsPage.tsx`**: A static UI for exporting reports. Currently simulates generation with `setTimeout`.
- **`ExecutiveOverviewPanel.tsx`**: Displays top-level KPIs, fleet status counts, target achievements, and AI summary text.
- **`FleetIntelligencePanel.tsx`**: Shows total runtime/downtime and uses Donut/Area charts for utilization and distribution.
- **`OeeAnalyticsPanel.tsx`**: Uses Radial gauges for the three OEE pillars and a Waterfall chart for loss breakdown.
- **`DeviceIntelligencePanel.tsx`**: Contains the main `DataTable` for assets and highlights top/bottom performers.
- **`SessionIntelligencePanel.tsx`**: Focuses on charging session counts, success rates, and peak hour heatmaps.
- **`AiInsightsPanel.tsx`**: Renders dynamic, descriptive insights based on simple heuristic comparisons of asset data.
- **`DeviceProfileDrawer.tsx`**: A detailed modal for a single `AssetRuntime` object, showing its specific metrics and simulated historical trend.
- **`OeeDrilldownPanel.tsx`**: A generic slide-out panel wrapper used for presenting detailed views without leaving the context of the main page.

# Design Decisions
- **Tabbed Architecture**: The sheer volume of operational metrics necessitates a tabbed design in `OeePage` to prevent cognitive overload. It organizes data logically from executive summary down to device intelligence.
- **Client-Side Aggregation**: Much of the business logic (e.g., categorization, top/bottom sorting) is performed on the client-side using `useMemo`. This allows for extremely responsive UI updates as real-time data flows in from the store, avoiding repeated server round-trips for simple aggregations.
- **Simulated History**: Trend charts currently use `Math.random()` mixed with real current values to simulate historical data. This decision allows the UI to be fully built and tested for visual integrity before the backend time-series database integration is complete.
- **Visual Status Cues**: Consistent use of semantic colors (emerald/brand/rose) across badges, text, and charts allows operators to quickly spot anomalies in a data-dense environment.

# Future Improvements
- **Real Historical Data**: Replace the simulated array generations (`Math.random()`) in `useMemo` blocks with actual time-series data fetches from the backend engine.
- **Pagination and Filtering**: If the fleet grows to thousands of devices, the `DataTable` in `DeviceIntelligencePanel` will need server-side pagination, sorting, and advanced filtering capabilities to maintain performance.
- **Actual Report Generation**: Connect the `OeeReportsPage` export buttons to a backend service that compiles real PDF/Excel documents based on current state.
- **Dynamic AI Insights**: The `AiInsightsPanel` currently uses hardcoded templates with basic variable interpolation. This could be upgraded to integrate with an LLM or a more sophisticated rule engine for deeper, context-aware insights.

# Module Summary
The Overall Equipment Efficiency (OEE) module acts as the operational heartbeat of the MIKOS Dashboard. By breaking down the complex OEE calculation into understandable visual components (Availability, Performance, Quality), and organizing data hierarchically from fleet-wide executive summaries down to individual device profiles, it empowers operators to quickly identify inefficiencies, monitor charging session health, and take corrective actions based on both real-time telemetry and AI-driven insights.
