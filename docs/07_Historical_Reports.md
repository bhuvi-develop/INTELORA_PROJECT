# Module Overview
The Historical Reports module provides a unified view for analyzing and exporting archived records across five different datasets: Telemetry, Anomalies, Predictions, Maintenance (Preventive), and Alerts. It allows users to filter, search, paginate, and export data into PDF, Excel, and CSV formats, ensuring a consistent structure across all reports.

# UI Overview
The UI features a structured page layout starting with a page header that displays global statistics and total record counts. Below it is an export bar providing quick actions to download reports. A tabbed interface allows users to seamlessly switch between the five record sets. The core of the page is a primary data table area, which, for the telemetry dataset, also includes a bar chart trend visualizing archived daily energy above the table.

# Navigation Flow
Users navigate to the Historical Reports module from the main application navigation (referenced via `MODULE_TITLES.reports`). Within the module itself, users navigate between different datasets using a tabbed selector (`Tabs` component). Pagination controls at the bottom of the data tables allow users to page through datasets without navigating away from the main view.

# Component Breakdown
- `HistoricalReportsPage`: The main container component that manages state for filters, search text, pagination, and the currently active dataset. It is responsible for computing filtered rows, column definitions, and passing data to the export pipeline.

# UI Components
- **`PageHeader`**: Displays the page title, subtitle, badges for total records, and `MetaStat` components for summary counts.
- **`Card` & `CardHeader`**: Used to wrap the export section and the tab selector for consistent layout.
- **`Tabs`**: A navigation component that allows switching between RecordSets (Telemetry, Anomalies, Predictions, Maintenance, Alerts).
- **`BarTrend`**: A chart component from `@/components/charts` used to visualize daily energy totals.
- **`DataTable`**: A shared data table component used to render the list of records based on the active tab.
- **`TableToolbar`**: Contains the search input and filter selectors (Date range, Category).
- **`Pagination`**: A footer component for the table to manage active pages and page size.
- **Badges & Formatters**: Components like `AnomalyStatusBadge`, `SeverityBadge`, `TaskStatusBadge`, `PriorityBadge`, `DeviceIdentity`, and `HealthValue` are used extensively to render rich table cells.

# Business Logic
The core logic revolves around filtering and presenting the correct dataset based on user input:
- **Range Filtering**: Calculates a timestamp `cutoff` based on the selected range ('7', '14', '30' days, or 'all') relative to the engine's current time snapshot (`at`).
- **Search**: Filters records by a debounced search term across multiple relevant string fields (e.g., assetId, assetName, error code, title).
- **Category Filtering**: Restricts results to a specific device category or allows 'all'.
- **Alerts Derivation**: The "Alerts" dataset is not a distinct store but is dynamically derived from the anomaly journal by filtering for records with 'Critical' or 'Major' severities.
- **Export Pipeline**: Handles exporting the current table view to PDF, Excel, or CSV. The structure is strictly defined per dataset in `exportDefs`, ensuring consistent columns across all file formats.

# Detection Logic
This module is primarily for historical review rather than active, real-time detection. However, it incorporates a logical identification step by deriving "Alerts" from the broader anomaly journal, classifying anomalies with a severity of `Critical` or `Major` as high-priority alerts.

# Data Flow
1. The component retrieves raw datasets from Zustand state engine stores: `useAnomalyJournal`, `useDailyRecords`, `usePredictionRecords`, and `usePreventiveTasks`.
2. Based on local UI state filters (`range`, `category`, `search`), `useMemo` hooks recalculate the filtered rows for each dataset.
3. The filtered data is then paginated by slicing the array based on the active `page` and `pageSize`, and fed into the `DataTable` component.
4. When a user triggers an export, the complete (un-paginated) filtered data array is passed to the `exportReport` utility function along with its specific column mapping.

# API Integration
There is no direct HTTP API integration within this component. It consumes all data entirely from the client-side state engine stores (`@/engine/store`). The report generation is handled by a utility function `exportReport` which processes the data client-side.

# State Management
The component relies heavily on React `useState` for local UI interactions:
- `recordSet`: Tracks the currently active tab.
- `range`: Stores the selected time range filter.
- `category`: Stores the selected device category filter.
- `search`: Stores the raw text search input.
- `page` & `pageSize`: Manages pagination state.
It also uses `useDebounce` to delay the execution of the search string filter, preventing lag during typing, and `useSnapshot` to acquire the engine's current time to accurately calculate range cutoffs.

# Charts
- **BarTrend**: When the Telemetry tab is active, this component displays an "Archived daily energy" chart. It aggregates the total energy (kWh) per day from the currently filtered `telemetryRows` array and renders a bar chart using the primary brand color (`SERIES[1]`).

# Tables
The `DataTable` component is the primary data display mechanism.
- **Columns**: Defined using `@tanstack/react-table`'s `ColumnDef`. Each dataset has its own strictly typed column definition array (`telemetryColumns`, `anomalyColumns`, etc.), featuring custom cell renderers for visual flair (e.g., `SeverityBadge`, `HealthValue`).
- **Toolbar**: Integrates the `TableToolbar` to provide a unified UI for search and filtering above the table.
- **Pagination**: Uses the `Pagination` component to navigate between pages and select page sizes (10, 25, 50, 100).

# User Workflow
1. The user opens the Historical Reports page.
2. The user selects a dataset of interest via the tabs (e.g., Telemetry, Anomalies).
3. The user applies global filters: Date range (e.g., Last 30 days) and Category.
4. The user optionally types into the search box to find specific assets, tasks, or anomaly codes.
5. The user reviews the filtered data in the resulting table and, if on Telemetry, the energy chart.
6. To extract the data, the user clicks one of the export buttons (PDF, Excel, CSV) to download a file containing the exact records currently in view.

# Folder Structure
- `src/pages/HistoricalReportsPage.tsx`: The singular, comprehensive page component containing all logic and UI declarations for this module.
*(Note: There is no `src/components/reports/` directory; the page relies on shared components from `src/components/common/`, `src/components/data/`, and `src/components/charts/`.)*

# File Explanation
- **`src/pages/HistoricalReportsPage.tsx`**: This file is responsible for laying out the Historical Reports module. It manages the filter states, computes the filtered row arrays for all five datasets, defines the `react-table` column configurations, sets up the export definitions, and renders the unified tabs, charts, and data tables.

# Design Decisions
- **Unified Export Pipeline**: By defining an `exportDefs` dictionary that contains the raw rows and column mappings for each dataset, the export function guarantees that CSV, Excel, and PDF formats always output exactly the same data structure.
- **Pre-computed Rows for All Tabs**: Filtered arrays for all datasets (`telemetryRows`, `anomalyRows`, etc.) are pre-computed continuously using `useMemo`. This allows the UI to instantly display accurate record counts in the tab headers themselves, helping users know where data exists without having to click through.
- **Derived Alerts Over Duplication**: Treating "Alerts" as a filtered view of the anomaly journal rather than maintaining a separate store prevents state synchronization issues and reduces memory usage.

# Future Improvements
- **Custom Date Range Picker**: Replace the fixed dropdown range options (7, 14, 30 days) with a full calendar date picker to allow arbitrary date filtering.
- **Saved Filter Views**: Implement a feature allowing users to save their specific filter, search, and category configurations as presets for quick access later.
- **Web Worker Export**: For extremely large datasets, generating Excel or PDF files could block the main thread; moving the `exportReport` processing to a background web worker would improve UI responsiveness.

# Module Summary
The Historical Reports module serves as a highly functional data visualization and extraction tool. By consolidating telemetry, anomalies, predictions, and maintenance records into a single tabbed interface with shared filtering and a robust export mechanism, it provides an efficient and cohesive user experience for retrieving and reporting on archived system data.
