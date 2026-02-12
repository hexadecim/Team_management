# Low-Level Technical Design: Team Management System

## 1. System Overview
The Team Management System is a microservices-based application built on top of a centralized PostgreSQL database. It features a robust **Zero Trust** security layer, automated data integrity triggers, and a dual-layer financial calculation architecture (persisted backend metrics with active frontend fallbacks).

### 1.1 Architecture Block Diagram
```mermaid
architecture-beta
    group frontend(cloud)[Frontend Layer]
    service ui(server)[UI Components] in frontend
    service fe_sec(lock)[Security Context] in frontend
    service calc_fb(calculate)[Frontend Calc Fallback] in frontend

    group security(shield)[Security & API Gateway]
    service cors(shield)[Strict CORS] in security
    service auth_mw(key)[Auth Middleware] in security
    service rbac_mw(lock)[RBAC Policy] in security

    group backend(server)[Backend Services]
    service res_svc(gear)[Resource Service] in backend
    service fin_svc(calculate)[Financial Calc SVC] in backend

    group infrastructure(server)[Shared Infrastructure]
    service sh_lib(book)[Shared Library] in infrastructure

    group database(database)[Data Layer]
    service iam_schema(database)[IAM Schema] in database
    service core_schema(database)[Core Schema] in database

    %% Interactions
    edge ui, fe_sec
    edge ui, calc_fb
    edge ui, cors
    edge cors, auth_mw
    edge auth_mw, rbac_mw
    edge rbac_mw, res_svc
    edge res_svc, fin_svc
    edge res_svc, sh_lib
    edge sh_lib, iam_schema
    edge fin_svc, core_schema
```

---

## 2. Database Architecture (PostgreSQL)
The database is partitioned into two logical schemas to separate concerns.

### 2.1 IAM Schema (Identity & Access Management)
Used for authentication, authorization, and session persistence.
- **`iam.users`**: Stores user credentials.
- **`iam.roles`**: Stores role definitions and a JSONB `permissions` matrix.
- **`iam.user_roles`**: Many-to-many junction table for roles.
- **`iam.sessions`**: **[NEW]** Tracks active sessions, IP addresses, and inactivity timestamps.
- **`iam.refresh_tokens`**: **[NEW]** Stores cryptographically hashed refresh tokens for persistent login.

### 2.2 Core Schema (Resources & Operations)
Stores the operational and financial data.
- **`core.employees`**: Includes `billable_rate`, `expense_rate`, and `total_allocation_sum`.
- **`core.projects`**: Includes `planned_budget` and project timelines.
- **`core.allocations`**: The primary source of truth for assignments.
- **`core.project_financials`**: **[NEW]** Persists calculated metrics: `used_budget`, `remaining_surplus`, and `total_projected_profit`.
- **`core.project_billing_monthly` / `core.project_expenses_monthly`**: **[NEW]** Stores time-series financial projections to optimize dashboard loading.

### 2.3 Data Integrity & Automation
- **`trg_check_allocation_limit`**: Prevents over-allocation (>100% per employee).
- **`trg_update_allocation_sum`**: Synchronizes employee allocation totals.
- **`dashboard_analytics_summary`**: Materialized View for global utilization.
- **Deletion Guardrails**: **[NEW]** Repository-level checks prevent deletion of employees or projects with active allocations to maintain referential integrity.

---

## 3. Shared Library (`@team-mgmt/shared`)
A centralized package for consistency across services.

### 3.1 Connection Pooling
Uses `pg.Pool` with global configuration.

### 3.2 Permission Resolver (`getPermissions`)
Aggregates multiple user roles into a single Permission Matrix (Strategy: `rw` > `r` > `none`).

---

## 4. Backend Architecture

### 4.1 Resource Service (Core API)
- **Zero Trust Security**:
    - **CORS**: Strict whitelist matching against `ALLOWED_ORIGINS`.
    - **JWT + Refresh Tokens**: Short-lived access tokens with long-lived, database-backed refresh tokens.
    - **Rate Limiting**: Global and auth-specific limits (standard: 5000 req / 15 min).
- **Financial Engine**: **[NEW]** `FinancialCalculationService` triggers a full project recalculation on every `POST/PUT/DELETE` of allocations or projects, ensuring the `core.project_financials` table is always current.

### 4.2 Analytics Service
- **Strategy**: Serves pre-calculated financial data from the persistent tables for high-speed dashboard rendering, eliminating the need for complex on-the-fly aggregations for standard views.

---

## 5. Frontend Architecture (React)

### 5.1 Security & Session Management
- **Persistence**: Sessions persist across page refreshes by validating the `accessToken` and automatically using `refreshToken` if expired.
- **Inactivity Timeout**: Strict 10-minute inactivity monitor (notifies user at 9m).

### 5.2 RBAC-Aware UI
- **Dynamic Rendering**: Navigation and action buttons (Edit/Delete) are hidden based on the Permission Matrix.
- **Validation**: Server-side errors (e.g., Deletion blocked by Guardrail) are displayed via global Toast notifications.

### 5.3 Financial Analytics Engine
- **Hybrid Source**: Primarily pulls from backend persistent tables.
- **Active Fallback**: Contains an identical implementation of the calculation logic to provide instant "what-if" feedback and dashboard stability if the primary API response is delayed.
- **Formatting**: Implements automated Y-axis scaling (`$k` units) for large financial projections.

---

## 6. Request Interconnection Flow (Example: Assign Project)
1. **Frontend**: User submits allocation; UI calculates an "Instant Preview".
2. **Backend**: `authenticate` and `checkPermission` verify zero-trust credentials.
3. **Database**: `trg_check_allocation_limit` validates capacity.
4. **Backend**: Post-commit, `FinancialCalculationService` asynchronously triggers a project-wide recalculation.
5. **Database**: `core.project_financials` and monthly tables are updated.
6. **Frontend**: Polling (2s interval) detects the updated backend state and refreshes the "USED" and "REMAINING" budget cards.
