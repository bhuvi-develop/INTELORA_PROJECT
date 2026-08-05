# Module Overview
The Alerts module in the MIKOS Dashboard project provides a centralized system for aggregating, managing, and displaying critical platform notifications. It bridges the gap between underlying anomaly detection engines, predictive maintenance models, and the user interface, consolidating diverse signals into a unified `PlatformAlert` format.

# UI Overview
The primary interface is the Alerts page (`AlertsPage.tsx`), which offers a clean, filterable, and searchable dashboard. It features a top header, a control bar for search and filtering, and a comprehensive data table displaying alert records. Visual indicators such as color-coded badges and icons ensure that critical and high-severity alerts are immediately distinguishable.

# Navigation Flow
Users access the Alerts module by navigating to the Alerts page within the dashboard layout. Once on the page, the user workflow involves scrolling through the list of aggregated alerts, filtering them by specific modules, or searching for specific devices and alert details.

# Component Breakdown
The module consists of the following key architectural components:
- **`AlertsPage`** (`src/pages/AlertsPage.tsx`): The main presentation component that handles user input (search and filtering) and renders the data table.
- **`AlertAggregator`** (`src/engine/AlertAggregator.tsx`): A headless React component (returning `null`) that continuously listens to the underlying anomaly and snapshot stores, processing new events into standardized alerts.
- **`AlertStore`** (`src/engine/alertStore.ts`): A custom state management class that implements the observer pattern to store, update, and dispatch alerts to the UI.
- **`SeverityIcon` & `SeverityBadge`**: Local UI sub-components in `AlertsPage` responsible for rendering visual representations of alert severities using Lucide icons.

# UI Components
The module utilizes several reusable UI components:
- `PageHeader`: For the page title and subtitle.
- `Card`: As a container for the data table.
- `Badge`: For displaying the module name and alert status.
- `DataTable`: A generic data grid component (`@/components/data/DataTable`) used to list the alerts.
- Lucide React Icons (`ShieldAlert`, `AlertTriangle`, `AlertCircle`, `Info`, `Search`, `Filter`): Used for visual enhancement and input adornments.

# Business Logic
The core business logic resides in `AlertAggregator.tsx`. Its primary responsibility is to normalize data from two distinct sources into the `PlatformAlert` format:
1. **Anomalies**: It iterates over `useAnomalyJournal()`, mapping the detection method to a module name (e.g., 'Predictive Maintenance' or 'AI Anomaly Detection'), and translating internal anomaly severities/statuses to alert severities/statuses. It also constructs a recommended action string if a component is specified.
2. **Predictive Signals**: It scans the asset snapshots (`useSnapshot()`). If an asset has a primary prediction with a `failureProbability` greater than 80% (0.8), it dynamically generates a predictive alert, assigning it a 'High' or 'Critical' severity based on thresholds.

# Detection Logic
- **Anomaly Events**: Sourced directly from the engine's anomaly journal.
- **Predictive Maintenance Thresholds**: A hardcoded threshold logic checks if `failureProbability > 0.8`. If the probability exceeds `0.9`, the severity is elevated to 'Critical'; otherwise, it remains 'High'. The remaining useful life (RUL) is also calculated and appended to the alert description.

# Data Flow
1. The underlying engine updates the `useAnomalyJournal` and `useSnapshot` stores.
2. `AlertAggregator` detects these changes via React's `useEffect`, processes the raw data, and constructs `PlatformAlert` objects.
3. `AlertAggregator` publishes these alerts to the `platformAlertStore` using `publishMany()`.
4. `platformAlertStore` updates its internal `Map`, deduplicates based on status and severity changes, updates its sorted array cache, and notifies listeners.
5. `AlertsPage` consumes the alerts via the `usePlatformAlerts` hook, applies local search/module filters, and renders the updated list to the DOM.

# API Integration
The current implementation relies heavily on an internal engine and local state (`@/engine/store` and `@/engine/alertStore.ts`). Direct REST or WebSocket API integrations for fetching alerts from a backend server are abstracted away by the engine stores and are not explicitly handled in this specific module.

# State Management
State management is handled by a custom `AlertStore` class in `alertStore.ts`. 
- **Storage**: Uses a `Map<string, PlatformAlert>` for O(1) lookups and updates.
- **Reactivity**: Implements `subscribe` and `getSnapshot` methods, which makes it compatible with React's `useSyncExternalStore` hook (`usePlatformAlerts`).
- **Optimization**: Maintains a `cachedSnapshot` of alerts, sorted descending by timestamp, preventing expensive sorting operations on every re-render.
- **Local UI State**: `AlertsPage.tsx` manages `search` (string) and `moduleFilter` (string) via standard `useState` hooks, applying them through a `useMemo` block to compute the `filteredAlerts`.

# Charts
There are no charts implemented within the Alerts module. 

# Tables
The module makes extensive use of the `DataTable` component. The table columns include:
- **Time**: Formatted timestamp.
- **Severity**: Visual badge indicating 'Critical', 'High', 'Medium', 'Low', or 'Info'.
- **Module**: The origin module (e.g., 'Predictive Maintenance').
- **Device**: Displays both the `deviceName` and `deviceId`.
- **Alert Details**: Displays the alert `title` and a truncated `description`.
- **Status**: Visual badge indicating current status ('Active', 'Acknowledged', etc.).

# User Workflow
1. **Viewing**: The user opens the Alerts page and views the chronologically sorted list of platform alerts.
2. **Searching**: The user types in the search bar. The data table instantly filters rows matching the query against device ID, device name, alert title, or description.
3. **Filtering**: The user selects a specific module from the dropdown to isolate alerts originating from that particular subsystem (e.g., only 'AI Anomaly Detection' alerts).

# Folder Structure
- `src/pages/AlertsPage.tsx`: The presentation layer.
- `src/engine/AlertAggregator.tsx`: The data processing and aggregation layer.
- `src/engine/alertStore.ts`: The state management layer.
- `src/types/alerts.ts`: TypeScript interfaces and type definitions.

# File Explanation
- **`AlertsPage.tsx`**: Renders the complete UI for the alerts dashboard, including filters and the data table.
- **`AlertAggregator.tsx`**: A logical bridge that extracts anomalies and predictive data from the system engine and standardizes them into platform alerts.
- **`alertStore.ts`**: A robust, reactive data store that holds the aggregated alerts and exposes them to the React component tree.
- **`alerts.ts`**: Contains the `PlatformAlert` interface and types for `AlertSeverity` and `AlertStatus`, ensuring type safety across the module.

# Design Decisions
- **Decoupled Aggregation**: Using `AlertAggregator` as a headless component separates the complex data mapping logic from the UI presentation, ensuring the `AlertsPage` remains lightweight and focused solely on rendering.
- **Custom Reactive Store**: Implementing a custom class-based store (`AlertStore`) with `useSyncExternalStore` avoids the overhead of larger state management libraries (like Redux) while providing highly optimized, concurrent-safe reactivity.
- **Memoized Filtering**: Utilizing `useMemo` in `AlertsPage` for `filteredAlerts` ensures that expensive string matching operations are only performed when the source alerts, search query, or filter dropdown actually change.

# Future Improvements
- **Actionable Alerts**: Implementing interactive features such as "Acknowledge" or "Resolve" buttons directly within the table rows.
- **Pagination and Virtualization**: As the alert history grows, integrating windowing or pagination into the `DataTable` will be necessary to maintain UI performance.
- **Advanced Filtering**: Adding date-range pickers and multi-select filtering for severity and status.
- **Backend Integration**: Connecting the `AlertStore` directly to real-time WebSockets or server-sent events (SSE) for production readiness.

# Module Summary
The Alerts module is a well-architected, reactive system for managing platform notifications. By decoupling data aggregation from presentation and leveraging optimized state management patterns, it provides a highly performant and user-friendly interface for monitoring critical system events and predictive maintenance signals.
