# Module Overview
The Predictive Maintenance module in the MIKOS Dashboard is an enterprise SaaS navigation dashboard designed to project degradation curves, remaining useful life (RUL), and predict potential failures using live telemetry streams from connected assets. It aggregates and visualizes data published by a FastAPI prediction service, applying derived view models to rank, group, and distribute records for decision-making. 

# UI Overview
The UI operates strictly in two states: a launcher hub (Landing Page) and an isolated workspace. There is no tab strip or accordion interface. When a workspace is entered from the hub, it replaces the current screen entirely, and the breadcrumb serves as the only navigation back to the hub. This guarantees a focused, single-context view on the screen at any moment. 
The hub presents a Hero section ("Prediction Engine Active") and a 4-column KPI grid holding 8 distinctive HubCards, along with summary charts (Fleet Health Degradation, Maintenance Load Forecast) and a bottom Platform Status bar.

# Navigation Flow
The navigation strictly alternates between the `PredictiveHub` and one of eight specific workspaces. The view state is held within the page (`PredictiveMaintenancePage`) rather than the router, allowing internal navigation without affecting the platform's route configuration. The 8 distinct workspaces are:
- Remaining Useful Life (`rul`)
- Failure Probability (`probability`)
- Component Health (`components`)
- Preventive Maintenance (`preventive`)
- Prescriptive Maintenance (`prescriptive`)
- Maintenance Queue (`queue`)
- Prediction Analytics (`analytics`)
- Historical Reports (`reports`)

# Component Breakdown
- **PredictiveMaintenancePage**: The root module component. Handles the current workspace state (`WorkspaceId | null`) and subscribes to the platform store once, computing derived selectors and supplying them via `PredictiveContext.Provider`.
- **PredictiveContext**: Shares derived view models (`assets`, `rows`, `components`, `tasks`, `signals`) and the `open`/`close` navigation functions to avoid re-selecting and re-calculating the same snapshots in multiple surfaces.
- **PredictiveHub**: The main landing dashboard rendering the summary Hero, 8 KPI HubCards, and predictive charts.
- **HubCard**: A compact, interactive launcher card with smooth hover animations, displaying KPI metrics, supporting metrics, and status badges to enter a specific workspace.
- **Workspaces**: Specialized isolated views such as `RulWorkspace`, `FailureProbabilityWorkspace`, `QueueWorkspace`, etc.

# UI Components
- **HubCard**: Displays an icon, workspace label, status chip (critical, warning, normal, idle), a primary metric, supporting sub-metrics, and an action footer. Integrates radial glows and framer-motion interactions.
- **LineTrend & BarTrend**: Reusable charting components (from `@/components/charts`) utilized on the hub to show "Fleet Health Degradation" and "Maintenance Load Forecast".
- **AnimatePresence**: Handles smooth `framer-motion` transitions between the Hub and Workspaces.

# Business Logic
- **RUL Bands**: Grouping of assets by remaining useful life horizons (Under 7 days, 7 to 30 days, 30 to 90 days, etc.) to inform procurement and budget decisions.
- **Probability Bands**: Grouping by risk scoring (Very likely, Likely, Possible, Unlikely).
- **Component Class Aggregation**: Identifying which specific part types are wearing across a whole class of devices, answering procurement questions about stocking spares.
- **Prioritization**: Ranks components based on soonest failure (`rulDays`) and highest `failureProbability` to drive the maintenance queue.

# Detection Logic
- The module relies on the backend prediction engine for domain figures (RUL, probability, confidence, wear, priority).
- **Predictive Signals**: Filters the anomaly journal for records where a `component` is specified and the asset is known, signifying events that alter a component's wear prediction.

# Data Flow
1. The `PredictiveMaintenancePage` uses custom hooks (`useAssetList`, `useAnomalyJournal`, `usePreventiveTasks`) to pull data from the global platform store.
2. Memoized selectors (`assetRows`, `componentRows`, `predictiveSignals`) format the raw store data into distinct view models (`AssetPredictionRow`, `ComponentRow`, `AnomalyRecord[]`).
3. The derived view models are passed into `PredictiveContext`.
4. Any component in the module (Hub, HubCard, Workspace) consumes these pre-computed models via `usePredictive()`, ensuring exact data synchronization across all UI surfaces.
5. `usePredictiveAlerts` hooks into the signals array to fire live toast notifications when new predictive-relevant signals arrive.

# API Integration
The UI module computes no domain values on its own. All numbers (Remaining Useful Life, Failure Probability, Wear, Maintenance Priority, Recommendation) are generated and published by the FastAPI prediction service and passed through the platform store untouched.

# State Management
- **Local View State**: The `workspace` state (`WorkspaceId | null`) is managed entirely inside `PredictiveMaintenancePage` using React's `useState`.
- **Global Context**: `PredictiveContext` distributes the derived arrays to prevent duplicate calculations and reconcile data across surfaces.
- **Notification State**: `usePredictiveAlerts` utilizes a `useRef<Set<string>>` to track previously seen signal IDs, ensuring toasts are only shown for newly arriving signals and capping them at 3 per cycle to prevent flooding.

# Charts
- **Fleet Health Degradation**: A `LineTrend` chart displaying the projected risk profile vs. asset efficiency over the coming week.
- **Maintenance Load Forecast**: A `BarTrend` chart visualizing upcoming critical vs. routine maintenance tasks across the week.

# Tables
*(Detailed tables are present inside individual Workspace components like `RulWorkspace`, `QueueWorkspace`, etc., which utilize the pre-calculated rows such as `assetRows` and `componentRows` passed via context.)*

# User Workflow
1. User arrives at the **Predictive Maintenance Hub**.
2. User reviews high-level KPIs, Fleet Health Risk, Active Signals, and charts.
3. User notices a HubCard exhibiting a 'critical' or 'warning' state (e.g., "Failure Probability" showing "High Risk").
4. User clicks the HubCard to open the isolated **Workspace**.
5. User analyzes detailed tabular data, charts, and recommendations answering the specific workspace question (e.g., "What is the probability of failure?").
6. User clicks the back breadcrumb to return to the Hub.

# Folder Structure
```
src/
  pages/
    PredictiveMaintenancePage.tsx     # Entry point and state host
  components/predictive/
    context.ts                        # PredictiveContext definition
    navigation.ts                     # Workspace definitions and metadata
    PredictiveHub.tsx                 # Dashboard landing component
    HubCard.tsx                       # Individual KPI card for navigation
    WorkspaceFrame.tsx                # Common wrapper for workspace views
    shared/
      selectors.ts                    # Pure functions for ranking, grouping, formatting
      usePredictiveAlerts.ts          # Custom hook for live notifications
    workspaces/                       # Isolated workspace components
      AnalyticsWorkspace.tsx
      ComponentHealthWorkspace.tsx
      ...
```

# File Explanation
- **`PredictiveMaintenancePage.tsx`**: Holds the workspace state, aggregates global store data, generates derived rows, fires the alert hook, and wraps the sub-components in `PredictiveContext` and `AnimatePresence`.
- **`context.ts`**: Defines the shape of `PredictiveContextValue` and provides the `usePredictive` hook.
- **`navigation.ts`**: Contains the constant `WORKSPACES` array defining the `id`, `label`, `discipline`, `icon`, `question`, and `summary` for all 8 workspaces.
- **`PredictiveHub.tsx`**: Computes specific KPI derivations (highest risk, open tasks, mean confidence) and renders the dashboard layout, Hero, HubCards, and Charts.
- **`HubCard.tsx`**: A purely presentational component handling the complex styling, hover states, and status chip coloring for a single navigation card.
- **`shared/selectors.ts`**: Contains pure data transformation functions like `assetRows`, `componentRows`, `distributeByRul`, `predictiveSignals` and formatting helpers (`formatDays`).
- **`shared/usePredictiveAlerts.ts`**: A `useEffect` driven hook that diffs the incoming anomaly signals against a `useRef` set to trigger toast notifications for new events.

# Design Decisions
- **No Domain Computation in UI**: The UI explicitly defers all prediction logic (RUL, probability, wear) to the FastAPI backend, restricting its responsibility to sorting, grouping, and displaying.
- **Single Context Screen**: Dispensed with traditional tab strips in favor of an immersive "hub and spoke" navigation model to ensure the user focuses on answering one specific operational question at a time.
- **Unified Store Subscription**: Subscribing to the store at the root page and passing derived data via context prevents tearing (where a figure on the hub differs from the workspace behind it).
- **Graceful Notification Handling**: `usePredictiveAlerts` suppresses toasts on initial page load and throttles bursts to max 3 per cycle to avoid alarm fatigue.

# Future Improvements
- Pagination or virtualization inside individual workspace tables for large fleets.
- Export functionality (PDF/CSV) directly from specific workspaces.
- Advanced filtering capabilities (by brand, model, or facility) applied at the context level to update all workspaces simultaneously.

# Module Summary
The Predictive Maintenance module serves as an advanced, focused command center for monitoring asset degradation and predicted failures. It achieves high consistency and performance by cleanly separating view state navigation, centralizing derived data aggregation via Context, and strictly delegating domain math to the backend. Its elegant "hub and spoke" navigation ensures operational clarity when making critical maintenance and procurement decisions.
