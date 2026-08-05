# Module Overview
The Settings module serves as the configuration and environment control center of the MIKOS Dashboard project. It provides an interface for users to modify UI preferences, control the live telemetry simulator engine, view identity and account information, review platform integrations (such as Grafana and API endpoints), and monitor the real-time status of platform infrastructure.

# UI Overview
The Settings page features a `PageHeader` that displays high-level platform status, user role, app version, and device KPIs. The main content is organized into a responsive grid of categorized `Card` sections:
- **Interface preferences**: Controls for appearance (theme), table density, default streaming window, and sidebar default state.
- **Telemetry stream**: Allows pausing, resuming, and manually stepping the live data simulator. It also displays the current ticks elapsed, sample interval, and wear clock multiplier.
- **Account and access**: Displays the current user's initials, name, role, organization, session timeouts, and the underlying authorization scheme.
- **Integrations**: Lists the API base URL, Grafana connectivity configuration, effectiveness target, and session storage keys.
- **Platform services**: A broad panel detailing the simulated backend services, including their operational state, latency, and uptime percentages.

# Navigation Flow
Settings is accessible from the main sidebar navigation. It operates as a standalone top-level route in the application dashboard. There are no nested sub-pages or secondary navigation routes within the Settings module.

# Component Breakdown
The root component for this module is the `SettingsPage` functional component.

An internal helper component is also defined within the file:
- `Row`: A functional component that renders a key-value pair horizontally, utilizing `<dl>`, `<dt>`, and `<dd>` semantic HTML elements.

# UI Components
The module relies extensively on shared UI components:
- `PageHeader`: Renders the title, subtitle, and primary header actions.
- `Badge`: Used within the header and integration cards to show status indicators.
- `Card` & `CardHeader`: Wraps individual categorical sections.
- `Segmented`: Provides segmented controls for selecting the theme, table density, and streaming window.
- `Switch`: A toggle input for the sidebar collapse preference.
- `Button`: Used for stream state controls (Pause/Resume/Step).
- `LiveIndicator` & `MetaStat`: Rendered in the page header to indicate live engine ticks and key platform metrics.

# Business Logic
- **Interface Control**: Allows users to dynamically update themes, table density, and layout preferences. Changes are applied immediately to the application.
- **Simulation Control**: Users can actively control the deterministic telemetry engine. They can start or pause the stream, and when paused, manually step through individual ticks.
- **Accelerated Wear**: The telemetry stream operates on an accelerated clock (`WEAR_TIME_SCALE`), visibly demonstrating equipment degradation over a shortened timeframe.
- **Informational Footnotes**: The UI includes notes clarifying that detection thresholds are managed per-device in the engine rather than as global constants, and that authentication is currently running as a standing operator identity.

# Detection Logic
There is no explicit detection logic handled within the Settings module. However, the UI provides context to the user, explaining that anomaly and threshold detection logic resides with each individual device profile inside the engine.

# Data Flow
- **UI State**: Handled via custom hooks (`useUI` and `useTheme`). Selections for density, liveWindow, sidebarCollapsed, and theme flow immediately to these contexts and are persisted in the browser.
- **Simulation State**: Fetched via the `useEngineControl` and `useSnapshot` Zustand stores. The UI binds directly to engine states like `running`, `tick`, `platform`, and `kpis`.
- **Configuration Constants**: Read directly from the `env` config, `APP` config, and engine variables like `TICK_MS` and `OEE_TARGET`.
- **User Data**: Fetched from the `useAuth` hook.

# API Integration
The Settings page does not execute external API calls. Information regarding API endpoints (e.g., `env.apiBaseUrl`, `env.grafana.baseUrl`) is displayed strictly for diagnostic purposes. Backend service statuses and latencies are fed by the `useSnapshot` simulation store rather than live network queries.

# State Management
The module coordinates state across multiple global stores:
- `useAuth`: Provides authentication state and user details.
- `useUI`: Manages application layout and density preferences.
- `useTheme`: Controls the visual theme.
- `useEngineControl`: A Zustand store that controls the simulation loop execution state.
- `useSnapshot`: A Zustand store exposing the real-time simulation state of platform infrastructure and KPI summaries.

# Charts
There are no charts utilized within the Settings module.

# Tables
There are no formal `<table>` elements. The module relies on the custom `Row` component, which builds descriptive lists (`<dl>`) to display tabular property-value data (e.g., Sample interval, Ticks elapsed) in a clean, readable format.

# User Workflow
- **Personalizing the Experience**: Users navigate to the Settings page to tailor the Appearance (Dark/Light), adjust Table density, or modify the default streaming window for live telemetry.
- **Simulation Management**: Developers or demonstrators can manipulate the telemetry stream—pausing it to inspect a specific tick, or advancing step-by-step to explain how the data evolves.
- **Environment Inspection**: Administrators can verify the application build version, check integration URLs, and review the operational health of simulated backend services.

# Folder Structure
- `src/pages/SettingsPage.tsx`: The primary route and single source file for the module.
*(Note: There is no `src/components/settings/` directory in the project structure; the module exclusively leverages global shared components.)*

# File Explanation
- `src/pages/SettingsPage.tsx`: Implements the entirety of the settings view. It imports icons from `lucide-react`, global constants from `@/config`, and simulation states from `@/engine/store`. The file is structured into a grid of categorical `Card` panels, blending interactive controls with read-only system diagnostics.

# Design Decisions
- **Unified Control Hub**: The design consolidates user preferences, identity details, and engine simulator controls into one cohesive view.
- **Transparent System State**: By prominently displaying API URLs, app version, and service latencies, the application builds trust and offers immediate diagnostic visibility.
- **Immediate Application**: Interface preferences update the global state immediately without requiring explicit "Save" actions, providing a fluid user experience.
- **Clear Explanatory Text**: Explanatory paragraphs are integrated directly into the cards (e.g., explaining the deterministic nature of the simulator) to help users understand the underlying mechanics.

# Future Improvements
- **Real Authentication**: Replace the currently bypassed standing operator session with comprehensive sign-in and user management workflows.
- **Configurable Endpoints**: Allow authorized users to modify API and Grafana base URLs dynamically via the UI instead of relying on build-time environment variables.
- **Global Threshold Overrides**: While thresholds are currently per-device, settings could eventually introduce global policies or severity multipliers.

# Module Summary
The Settings module (`SettingsPage.tsx`) acts as an integrated command center for the MIKOS Dashboard. It provides a seamless interface for adjusting UI preferences, reviewing current session and platform configurations, and directly manipulating the application's underlying live data simulation engine, serving the needs of both end-users and developers.
