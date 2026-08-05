# Module Overview
The Enterprise Cockpit is the primary dashboard and operational command center for the MIKOS platform. It provides a real-time, high-level overview of fleet health, energy consumption, anomalies, and overall equipment efficiency (OEE). It acts as the hub for operations managers to monitor the entire IoT fleet at a glance.

# UI Overview
The layout is orchestrated by the `CockpitPage.tsx` component, which serves as the main entry point. The UI consists of a top header (`CockpitHeader`), a grid of executive KPI cards (`ExecutiveKpiCard`), an AI executive summary (`AiExecutiveSummary`), and a platform health panel (`PlatformHealthPanel`). When an executive KPI card is clicked, the UI transitions to a specific workspace (e.g., Fleet Health, Total Assets) to provide drill-down details.

# Navigation Flow
- Users land on the default `'landing'` workspace.
- Clicking on any KPI card (e.g., Fleet Health, Total Assets, Warning Assets) updates the `activeWorkspace` state, hiding the main grid and displaying a dedicated workspace component (e.g., `FleetHealthWorkspace`, `TotalAssetsWorkspace`).
- Users can navigate back to the landing view via an `onBack` callback passed to the workspace components.
- The `QuickNavGrid` component provides direct links to other distinct modules in the application (e.g., Asset Management, AI Anomaly Detection, Grafana Analytics).

# Component Breakdown
- **CockpitPage**: Main page orchestrating the layout and active workspace state.
- **CockpitHeader**: Header showing organization, date, time, gateway state, and connected sensors.
- **ExecutiveKpiCard**: Reusable card showing a specific KPI, current value, comparison to yesterday, trend, sparkline, and status color.
- **AiExecutiveSummary**: An AI-generated textual briefing on the fleet's current state.
- **PlatformHealthPanel**: Summarizes the status of core backend infrastructure services.
- **LiveTelemetryStrip**: Real-time aggregate readout of telemetry channels.
- **EnergyIntelligencePanel**: Panel showing energy consumption metrics, trends, and a Grafana chart integration.
- **LiveAssetGrid**: A grid view of connected devices showing their real-time condition and telemetry.
- **ActivityFeed**: A timeline of operational activities (connectivity changes, alerts, etc.).
- **QuickNavGrid**: Grid of navigation links to drill-down modules.
- **EnterpriseHeatmap**: A visual heatmap grouping assets by their device category.

# UI Components
The module relies heavily on internal UI primitives and external libraries:
- **Internal**: `Card`, `Badge`, `Progress`, `Tooltip`, `Skeleton`, `Input`, `Segmented`, `SectionHeader`, `StatusBadge`.
- **External**: `framer-motion` for animations and transitions, `lucide-react` for consistent iconography.
- **Styling**: Tailwind CSS with the `cn` utility for class merging.

# Business Logic
- **KPI Calculations**: Evaluates health status thresholds (good >= 95, warning >= 65) and calculates the average remaining useful life (RUL) of assets.
- **Energy Analysis**: Compares current consumption with previous day, week, and month totals. It projects cost and carbon based on tariffs.
- **OEE Target Evaluation**: Compares real-time OEE against an `OEE_TARGET`.
- **Sorting Logic**: In the `LiveAssetGrid`, assets can be sorted by "attention" (offline/weakest first), power draw, or name.

# Detection Logic
- The `AiExecutiveSummary` computes a summary based on the highest priority issues. It checks for active anomalies, critical health scores, elevated energy consumption, and preventive maintenance needs (e.g., RUL <= 30 days) to construct its briefing lines.
- Fleet health score and component RUL are continuously evaluated to flag assets in the warning or critical categories.

# Data Flow
- Data flows top-down via React state and context.
- Global application state is predominantly retrieved using the `useSnapshot()` hook from `@/engine/store`.
- Components like `LiveTelemetryStrip` aggregate data from `useAssetList()` and ease the values using `useSmoothedValues` to prevent UI jitter between engine ticks.
- Derived data (like trend lines and summary text) is calculated using `useMemo` to optimize rendering performance.

# API Integration
- **Grafana**: The `EnergyIntelligencePanel` embeds a `GrafanaPanel` component to fetch and display long-term historical telemetry data (`env.grafana.dashboards.telemetry`).
- The module heavily depends on a centralized state engine (`@/engine/store`) which abstracts the underlying data fetching and WebSocket streams for real-time telemetry.

# State Management
- **Global State**: `useSnapshot()`, `useAssetList()`, `useEngineControl()`, and `useFleetKpis()` manage the global store for KPIs, OEE, assets, energy, operational health, and engine ticks.
- **Local State**: `useState` is used for managing the `activeWorkspace` in `CockpitPage`, and `search`/`sort`/`expanded` states in `LiveAssetGrid`.
- **Derived State**: `useMemo` is utilized extensively for computing trend trails, filtering asset lists, and generating dynamic AI summary text.

# Charts
- **Sparklines**: `Sparkline` components are rendered within the `ExecutiveKpiCard` to show short-term KPI trends.
- **Bar Charts**: `BarTrend` is used in the `EnergyIntelligencePanel` to display daily energy consumption.
- **External Panels**: `GrafanaPanel` provides long-term energy analysis charts.

# Tables
- There are no explicit HTML `<table>` elements used in this module. 
- Tabular or list-based data is presented using CSS grid layouts (e.g., `LiveAssetGrid`, `QuickNavGrid`) and styled list structures (e.g., `ActivityFeed`, `PlatformHealthPanel`).

# User Workflow
1. **Overview**: The user views the overarching fleet metrics on the landing workspace.
2. **Briefing**: The user reads the `AiExecutiveSummary` for an instant textual briefing on the fleet's most pressing issues.
3. **Drill-down**: The user clicks on specific KPI cards (e.g., Fleet Health, Critical Assets) to open a dedicated workspace and investigate further.
4. **Monitoring**: The user scrolls to view live telemetry, energy intelligence, and the live asset grid.
5. **Filtering**: The user filters or sorts devices in the `LiveAssetGrid` to locate specific assets or find the highest power consumers.
6. **Navigation**: The user utilizes the `QuickNavGrid` to jump to other specialized modules (e.g., Asset Management, Reports).

# Folder Structure
- `src/pages/CockpitPage.tsx`: The main route and layout component.
- `src/components/cockpit/`: Directory containing all cockpit-specific UI components.
- `src/components/cockpit/workspaces/`: Directory containing the drill-down workspace components invoked by the KPI cards.

# File Explanation
- **CockpitPage.tsx**: The entry point and main layout container managing workspace transitions.
- **ActivityFeed.tsx**: Renders the operational activity timeline (connectivity changes, alerts).
- **AiExecutiveSummary.tsx**: Renders the AI text briefing based on the fleet's current state.
- **CockpitHeader.tsx**: Renders the top header with date, time, and gateway status.
- **EnergyIntelligencePanel.tsx**: Renders energy metrics, short-term trends, and the Grafana panel.
- **EnterpriseHeatmap.tsx**: Renders a category-based heatmap of assets and their health status.
- **ExecutiveKpiCard.tsx**: A reusable component for displaying a KPI, trend, and sparkline.
- **LiveAssetGrid.tsx**: A grid of individual asset cards with search, filtering, and sorting capabilities.
- **LiveTelemetryStrip.tsx**: A strip showing aggregated, smoothed real-time telemetry across all reporting devices.
- **PlatformHealthPanel.tsx**: A panel summarizing the operational status of backend infrastructure services.
- **QuickNavGrid.tsx**: A navigation grid linking to other application modules.
- **index.ts**: Central export file for all cockpit components.

# Design Decisions
- **Smoothed Real-time Updates**: `useSmoothedValues` is used in `LiveTelemetryStrip` to smoothly transition numbers between engine ticks, creating a fluid live feel without jitter.
- **Themed UI**: Colors and series (e.g., `SERIES`, `CHANNEL_COLOR`) are dynamically fetched to respect the active application theme.
- **Performance Optimization**: Widespread use of `useMemo` prevents unnecessary recalculations of large asset arrays and derived data during high-frequency render cycles.
- **Progressive Disclosure**: The `LiveAssetGrid` caps initial results and uses a "Show all" button to prevent overwhelming the DOM.

# Future Improvements
- **Workspace Handling**: Implement a dedicated `GoodAssets` workspace. Currently, clicking "Good Assets" falls back to the `HealthyAssets` workspace.
- **Heatmap Interactivity**: Expand the `EnterpriseHeatmap` with more interactive features, tooltips, and click-to-filter drill-down capabilities.
- **Component Decoupling**: Further decouple the components from the centralized store if they need to be reused in contexts outside the main cockpit engine.

# Module Summary
The Enterprise Cockpit is a highly responsive, data-dense dashboard designed for operations managers. It serves as the central hub of the MIKOS platform, combining high-level executive KPIs, AI-generated summaries, and real-time telemetry aggregation. The module is built with a focus on real-time performance, utilizing smoothed animations and intelligent state management to provide actionable insights and seamless drill-down capabilities into specific assets and alerts.
