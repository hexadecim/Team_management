# Deployment Guide: Team Management System

This guide provides instructions for deploying the Team Management System in both local and production-ready environments.

---

## 🏗️ 1. Prerequisites
Ensure the following are installed on the deployment host:
- **Docker & Docker Compose**: For containerized database management.
- **Node.js (v18+)**: Runtime for microservices and frontend.
- **npm**: Package manager.

---

## 🗄️ 2. Database Setup
The system requires a PostgreSQL instance with specific schemas and triggers.

### 2.1 Start PostgreSQL
Use the provided `docker-compose.yml` to start the database:
```bash
docker-compose up -d
```
*Note: This starts Postgres on port `5433` as configured in the project.*

### 2.2 Schema Initialization
The database handles business logic via triggers. Initialize the schema using the `init.sql` file:
```bash
docker exec -i team-mgmt-postgres psql -U admin -d team_mgmt < init.sql
```
This script sets up:
- `iam` schema (Users, Roles, User-Role mappings).
- `core` schema (Employees, Projects, Allocations).
- Triggers for 100% capacity enforcement and Materialized View refreshes.

---

## 📦 3. Application Setup

### 3.1 Install Dependencies
Navigate to each service directory and install dependencies:
```bash
# Shared Package (CRITICAL: Must be linked/installed first)
cd packages/shared && npm install

# Microservices
cd ../../apps/event-bus && npm install
cd ../resource-service && npm install
cd ../analytics-service && npm install

# Frontend
cd ../web && npm install
```

### 3.2 Configuration (Environment Variables)
Ensure the following variables are configured if running outside the default setup:
- **Resource Service**: Uses port `4001`. Database config is pulled from `@team-mgmt/shared`.
- **Analytics Service**: Uses port `4002`.
- **Event Bus**: Uses port `4005`.
- **Shared DB Config**: Found in `packages/shared/db/config.js`. Update host/port if your Postgres instance differs.

---

## 🚀 4. Starting the Services

### 4.1 Automated Startup (Local)
Use the provided startup script (modify `BASE_DIR` in the script to match your absolute path):
```bash
chmod +x start-all.sh
./start-all.sh
```

### 4.2 Manual Startup
Start services in the following order to ensure event registration works correctly:
1. **Event Bus**: `cd apps/event-bus && npm start`
2. **Resource Service**: `cd apps/resource-service && npm start`
3. **Analytics Service**: `cd apps/analytics-service && npm start`
4. **Web Frontend**: `cd apps/web && npm run dev`

---

## 📑 5. Service Map & Endpoints
| Component | Default Port | Description |
| :--- | :--- | :--- |
| **Web UI** | `5173` | Main Dashboard & Admin Interface |
| **Resource API** | `4001` | IAM, Employees, and Projects |
| **Analytics API** | `4002` | Live Utilization Stats |
| **Event Bus** | `4005` | Internal Service Coordination |
| **PostgreSQL** | `5433` | Centralized Data Store |

---

## 🛡️ 6. Production Considerations
1. **Secrets Management**: Replace the `JWT_SECRET` in `resource-service/index.js` with a secure environment variable.
2. **Persistence**: Ensure Docker volumes are configured for the PostgreSQL container to prevent data loss.
3. **Reverse Proxy**: Use Nginx or a similar proxy to handle TLS/SSL and route traffic to the frontend and APIs.
4. **Monitoring**: The services log to `stdout`. Integrate with a logging aggregator (e.g., ELK stack or CloudWatch) for production monitoring.
