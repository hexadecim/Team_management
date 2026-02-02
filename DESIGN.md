# Low-Level Technical Design: Team Management System

## 1. System Overview
The Team Management System is a microservices-based application built on top of a centralized PostgreSQL database. It features a robust Role-Based Access Control (RBAC) layer, automated data integrity checks, and high-performance analytics using Materialized Views.

---

## 2. Database Architecture (PostgreSQL)
The database is partitioned into two logical schemas to separate concerns.

### 2.1 IAM Schema (Identity & Access Management)
Used for authentication and authorization.
- **`iam.users`**: Stores user credentials and a deprecated `role_names` array for fallback.
- **`iam.roles`**: Stores role definitions and a JSONB `permissions` matrix (e.g., `{"employee_list": "rw"}`).
- **`iam.user_roles`**: **(Normalized Junction Table)**. Links users to roles in a many-to-many relationship. This supports users having multiple active roles simultaneously.

### 2.2 Core Schema (Resources & Operations)
Stores the operational data of the organization.
- **`core.employees`**: Stores employee details, denormalized `total_allocation_sum`, and financial tracking fields: `billable_rate` and `expense_rate`.
- **`core.projects`**: Project metadata.
- **`core.allocations`**: Tracks employee-project assignments with percentage and dates. This table is the source of truth for all financial and utilization calculations.

### 2.3 Data Integrity & Automation
- **`trg_check_allocation_limit`**: A `BEFORE INSERT/UPDATE` trigger on `core.allocations` that sums an employee's current usage. It prevents any record that would exceed 100% total allocation by raising a `data_exception`.
- **`trg_update_allocation_sum`**: An `AFTER INSERT/UPDATE/DELETE` trigger that synchronizes the `total_allocation_sum` in `core.employees`.
- **`dashboard_analytics_summary`**: **(Materialized View)**. Pre-aggregates Average Utilization, Bench Count, and Monthly Utilization.
- **`trg_refresh_analytics_summary`**: Automatically refreshes the Materialized View whenever an allocation is modified, ensuring "Live" analytics.

---

## 3. Shared Library (`@team-mgmt/shared`)
A centralized package used across all Node.js microservices to ensure architectural consistency.

### 3.1 Connection Pooling
Uses `pg.Pool` with global configuration for host, port, and max/min connections. Distributed services share the same connection logic but execute queries within their respective contexts.

### 3.2 Permission Resolver (`getPermissions`)
A critical logic block that:
1. Queries `iam.user_roles` and `iam.roles` for a specific user.
2. Aggregated multiple roles into a single **Permission Matrix**.
3. Resolution Strategy: `rw` (Read-Write) > `r` (Read) > `none`.
4. Resulting Object: `{ "employee_list": "rw", "allocation": "r" }`.

---

## 4. Backend Architecture

### 4.1 Resource Service (Core API)
Responsible for Managing IAM and Core resources.
- **Auth Middleware**: Validates incoming `Authorization: Bearer <JWT>` headers.
- **RBAC Middleware**: Implements `checkPermission(module, level)`. It inspects the `claims` embedded in the JWT to decide if the request should proceed to the repository layer.
- **Error Handling**: Standardizes PostgreSQL exceptions (like trigger violations) into `400 Bad Request` or `403 Forbidden` HTTP responses.

### 4.2 Analytics Service
A high-performance, stateless microservice.
- **Design Strategy**: Uses a hybrid approach. Global utilization and bench metrics are fetched from the `core.dashboard_analytics_summary` Materialized View for O(1) retrieval. Lifetime project profitability and burnrates are calculated on-the-fly to support dynamic filtering and "Real-time" what-if scenarios.

---

## 5. Frontend Architecture (React)

### 5.1 Security Persistence
- **JWT Storage**: Tokens are stored in `localStorage`.
- **Authenticated Requests**: All API calls utilize an interceptor-like pattern to inject the `token` into headers.

### 5.2 RBAC-Aware UI
The UI dynamically adapts based on the `claims` object inside the decoded JWT:
- **Tab Visibility**: Tabs like "Administration" are hidden if the user has `none` level access.
- **Conditional Action Rendering**: "Edit" and "Remove" buttons in the Employee List are conditionally rendered using `canEdit('employee_list')`.
- **Form Protection**: Validation errors from the backend (like the 100% limit) are bubbled up via a Toast notification system.
- **Bulk Import Validation**: Implements client-side pre-processing of CSV data to validate project exists, emails are unique, and financial formats are correct before hitting the API.

### 5.3 Financial Analytics Engine
The system implements a sophisticated client-side analytics engine for project health:
- **Lifetime Aggregation**: Scans the entire project history to calculate cumulative Income (Billable * Hours) and Expense (Cost * Hours).
- **Monthly Burnrate Line**: Calculates the current month's overhead by summing expense rates of all active project members.
- **Margin Visualization**: Uses a **Composed Chart (Bar + Line)** to contrast long-term profitability (bars) against current operational velocity (line).

---

## 6. Request Interconnection Flow (Example: Assign Project)
1. **Frontend**: User clicks "Assign" on the Allocation Board.
2. **Frontend**: Validates local inputs and sends `POST /allocations` with JWT.
3. **Backend**: `authenticate` middleware verifies JWT.
4. **Backend**: `checkPermission('allocation', 'rw')` middleware verifies the user has write access.
5. **Database**: `trg_check_allocation_limit` trigger calculates the sum in PostgreSQL.
6. **Database**: If total > 100%, trigger raises error; otherwise, record is saved.
7. **Database**: `trg_refresh_analytics_summary` trigger signals a Materialized View refresh.
8. **Backend**: Maps DB error (if any) to HTTP 400 or returns 201 Success.
9. **Frontend**: Receives response and displays Toast (Success or Capacity Error).
