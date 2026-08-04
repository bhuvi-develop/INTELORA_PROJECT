# Module Overview
Asset Performance Management (APM) is an enterprise decision and analytics hub for connected estate assets in the MIKOS Dashboard project. Sitting between Predictive Maintenance (PdM) and Overall Equipment Effectiveness (OEE), APM itself does not detect or predict. Instead, it consumes outputs from Anomaly Detection (AD) and PdM, aggregates devices into distinct assets, applies a criticality model, and publishes maintenance decisions and reliability figures that the downstream OEE module relies on.

# UI Overview
The APM module's user interface is heavily data-driven and avoids acting as a monolithic, overloaded dashboard. The main view (`ApmPage`) is structured around a top capabilities segmented navigation bar with eight distinct tabs: Fleet Overview, Registry & Hierarchy, Health & Criticality, Reliability, Maintenance & Orders, Cost & ROI, Executive & Benchmarks, and Reports.

To maintain consistency across sub-pages, the module uses a shared `ApmPageShell` component which provides standard breadcrumbs, a back control (returning to a known destination), a sticky filter rail, and export controls. 

# Navigation Flow
The standard navigation flow begins from Cockpit → Asset Performance (`/apm?tab=overview`).
From the overview, users can navigate via the segmented tab bar or through `ApmSectionCard` elements that direct to specific sub-pages like `ApmHealthPage`, `ApmReliabilityPage`, or `ApmCostPage`. 
When navigating into deeper analytics pages, the `ApmPageShell` renders a "Back to Asset Performance" button, explicitly routing back rather than using a generic `navigate(-1)` to handle edge cases like bookmarks or sibling navigations seamlessly.

# Component Breakdown
- **Pages**:
  - `ApmPage.tsx`: The primary module entry point. Handles top-level tabs and renders the comprehensive "Fleet Overview".
  - `ApmDashboardPage.tsx`: A KPI-rich landing page displaying estate-wide metrics and section cards for deep dives.
  - `ApmPageShell.tsx`: A shared layout wrapper that handles headers, breadcrumbs, filters, and standard layout across all 9 APM analytics pages.
- **Components (`src/components/apm/`)**:
  - `ApmAssetTable`: A highly reusable data table utilizing a column registry.
  - `ApmSectionCard`: Clickable cards summarizing key figures to route to specific analytics sections.
  - `ApmKpiGrid`: Grid layout for displaying high-level performance indicators.
  - Modals (`ApmAssetDetailModal`, `ApmWorkOrderLifecycleModal`): Overlays for detailed asset inspections or work order tracking.

# UI Components
- **StatTiles & MetaStats**: Displays summarized figures like Mean Health, Availability, and Health Spread.
- **Segmented Controls**: Used for main module navigation and toggle states (e.g., ranking "Worst first" vs "Best first").
- **Badges**: For status indication (e.g., Online, Critical).
- **Progress Indicators & Health Meters**: Visual bars representing condition scores and OEE.
- **Charts**: Integration with charting components (Trend Lines, Bar Trends).

# Business Logic
The business logic centers around deriving comprehensive indices from raw data:
- **Composite Health Index**: Derated from raw PdM condition scores by applying open anomaly pressure and asset duty logic.
- **Reliability Metrics**: Calculates MTBF (Mean Time Between Failures, accounting for censored intervals), MTTR (Mean Time To Repair), failure rates, and total downtime.
- **Criticality & Risk**: Generates criticality scores based on safety, production impact, replacement cost, lead time, and redundancy, leading to a comprehensive risk tier.
- **Economics**: Differentiates strictly between "committed spend" (planned maintenance costs) and "cost exposure" (risk probability multiplied by consequence).

# Detection Logic
APM does not perform active detection. It is explicitly designed to consume anomaly signals and predictive degradation curves from the Anomaly Detection (AD) and Predictive Maintenance (PdM) modules.

# Data Flow
1. **Inputs**: APM React hooks (`useApmOverview`, `useApmBacklog`, `useApmEffectiveness`) fetch aggregated data from the backend APM engine.
2. **State & Derivations**: Using `useMemo`, raw data is transformed into derived KPIs (mean health, performance, quality, health spread, rank rows, category bars).
3. **Outputs**: Processed data is fed into visual components, tables, and export functions. Additionally, APM forms a typed contract that the OEE module subsequently consumes.

# API Integration
The module relies on several custom hooks to fetch state and API data:
- `useApmOverview`, `useApmHierarchy`, `useApmBacklog`, `useApmEffectiveness`: Fetch APM specific scopes, fleet reliability, economics, and hierarchies.
- `useAssetList`, `useFleetKpis`, `useCategoryRollups`, `useFleetTrail`, `useAnomalyJournal`: Global store hooks providing context on the active device fleet.
- **Export**: Relies on a shared `exportReport` utility to generate CSV, Excel, or PDF reports directly from the APM datasets.

# State Management
- **URL Search Params**: Used to manage the active APM tab (`?tab=overview`).
- **Local React State**: `useState` is used for UI toggles (e.g., `rankMode`, `category` filters, `exportFormat`), and for tracking selected entity IDs for modals (`selectedAssetId`, `selectedOrder`).
- **Memoization**: `useMemo` is heavily leveraged to avoid recalculating sorts, filters, and derived statistics on every render, especially when processing the comprehensive `apmAssets` arrays.

# Charts
- **LineTrend**: Displays "Fleet condition trend" showing mean health and effectiveness across a streaming window.
- **BarTrend**: 
  - "Condition distribution": Device count per health band.
  - "Category health against availability": A horizontal comparison across device classes.
- **AssetStatusMatrix**: A visual matrix mapping all devices in scope colored by their condition band.
- **RiskDistributionBar**: Shows operational risk composition across the estate.

# Tables
- **ApmAssetTable**: A pivotal component built on `@tanstack/react-table`. It defines a `REGISTRY` of all possible APM columns (e.g., asset, pdmHealth, rul, inherent, downtimeCost). Sub-pages pass an array of `ApmColumnKey` strings to selectively render only the relevant columns. 
- **In-Page Category Table**: Renders category rollups in `ApmPage` with custom HTML table syntax for precise micro-interactions (health meters and small progress bars).

# User Workflow
1. The user navigates to the APM module and lands on the "Fleet Overview".
2. They evaluate high-level KPIs and check the "Fleet health ranking" to identify problematic assets holding the estate back.
3. Utilizing the segmented tabs or dashboard cards, the user drills down into specific domains like "Reliability" or "Maintenance".
4. Within a domain (e.g., Reliability), the `ApmPageShell` maintains context, allowing the user to view the specific `ApmAssetTable` filtered for reliability columns (MTBF, MTTR, Availability).
5. The user can filter the table, click on an asset to view its `ApmAssetDetailModal`, or export the full recordset (not just visible columns) to CSV/Excel for external analysis.

# Folder Structure
- `src/pages/ApmPage.tsx`: Root APM view.
- `src/pages/apm/`: Contains the `ApmPageShell.tsx`, `ApmDashboardPage.tsx`, and all domain-specific pages (e.g., `ApmReliabilityPage.tsx`, `ApmCostPage.tsx`). Also contains `apmSelectors.ts` for formatting and logic.
- `src/components/apm/`: Contains reusable APM-specific UI components, including the `ApmAssetTable.tsx`, tree hierarchies, KPI cards, and modals.

# File Explanation
- `ApmPage.tsx`: The primary orchestrator handling tabs and rendering the high-level fleet overview.
- `ApmPageShell.tsx`: A layout component providing a unified header, breadcrumb navigation, and filter rail for all sub-pages.
- `ApmDashboardPage.tsx`: Renders the high-level KPI grid and navigational `ApmSectionCard` elements.
- `ApmAssetTable.tsx`: The flexible, column-registry-based table component used for rendering asset lists across varying contexts.
- `apmSelectors.ts`: Contains shared logic for formatting values, determining colors (bands, risk), and defining standard export columns.

# Design Decisions
- **Decoupled Dashboards**: Explicitly avoiding a "mega-dashboard". `ApmDashboardPage` shows KPIs and links out. Real analytics happen on dedicated pages that have room to qualify what they show.
- **Column Registry Pattern**: Instead of each page duplicating table logic or passing massive configuration objects, `ApmAssetTable` owns a registry of all possible columns. Pages simply ask for the columns they need by string key.
- **Full-Record Export**: Exports from the `ApmAssetTable` always include the full column set, ensuring that a CSV exported from the "Cost" page can be safely joined with one exported from the "Reliability" page.
- **Brand Stripping**: Custom logic (`stripBrandName`) removes known brand names (e.g., Samsung, Dell) from asset names to clean up the UI presentation.

# Future Improvements
- **Server-Side Pagination**: Currently, filtering, sorting, and pagination within `ApmAssetTable` happen client-side. As the estate scales to tens of thousands of assets, this will need to migrate to server-side operations.
- **Custom View Saving**: Allowing users to save their specific column arrangements and filter states within the APM tables.

# Module Summary
The Asset Performance Management module is a robust, well-architected analytics hub within the MIKOS Dashboard. It successfully bridges raw predictive data and actionable operational maintenance strategies. By leveraging shared shells and a highly modular table architecture, it provides an expansive but easily navigable experience that prevents user fatigue while delivering critical enterprise insights.
