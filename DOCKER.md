# Docker Setup for Team Management Application

## Quick Start

### 1. Unlock User Accounts (if needed)

If you need to unlock user accounts after failed login attempts:

```bash
# Connect to your local PostgreSQL
psql -U sanjayrana -d team_management

# Run this SQL command
TRUNCATE TABLE iam.failed_login_attempts;

# Exit
\q
```

Or use the provided script (requires pg module):
```bash
cd apps/resource-service
node ../../scripts/unlock-accounts-standalone.js
```

### 2. Build and Run with Docker

```bash
# Build and start all services
docker-compose up --build

# Or run in detached mode
docker-compose up --build -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: This will delete all data)
docker-compose down -v
```

## Services

The application consists of three services:

### 1. PostgreSQL Database (`postgres`)
- **Port:** 5432
- **Container:** `team-mgmt-db`
- **Volume:** `postgres_data` (persistent storage)
- **Health Check:** Automatic health monitoring

### 2. Backend API (`backend`)
- **Port:** 4001
- **Container:** `team-mgmt-backend`
- **Technology:** Node.js Express
- **Depends on:** PostgreSQL

### 3. Frontend Web App (`frontend`)
- **Port:** 80
- **Container:** `team-mgmt-frontend`
- **Technology:** React + Vite + Nginx
- **Depends on:** Backend API

## Environment Variables

Copy `.env.example` to `.env` and update the values:

```bash
cp .env.example .env
```

Key variables:
- `DB_USER`: PostgreSQL username (default: postgres)
- `DB_PASSWORD`: PostgreSQL password (default: postgres)
- `JWT_SECRET`: Secret key for JWT tokens (CHANGE IN PRODUCTION!)
- `SESSION_TIMEOUT_MINUTES`: Session timeout duration

## Accessing the Application

Once all services are running:

- **Frontend:** http://localhost
- **Backend API:** http://localhost:4001
- **PostgreSQL:** localhost:5432

Default login credentials:
- Username: `admin`
- Password: `admin123`

## Development vs Production

### Development (Current Setup)
```bash
# Start local development servers
cd apps/web && npm run dev
cd apps/resource-service && node index.js
```

### Production (Docker)
```bash
# Build and run with Docker
docker-compose up --build -d
```

## Useful Docker Commands

```bash
# View running containers
docker ps

# View all containers (including stopped)
docker ps -a

# View logs for a specific service
docker-compose logs backend
docker-compose logs frontend
docker-compose logs postgres

# Restart a specific service
docker-compose restart backend

# Rebuild a specific service
docker-compose up --build backend

# Execute commands in a running container
docker exec -it team-mgmt-backend sh
docker exec -it team-mgmt-db psql -U postgres -d team_management

# Remove all stopped containers
docker container prune

# Remove all unused images
docker image prune -a
```

## Database Initialization

The PostgreSQL container will automatically run `init-db.sql` on first startup if the file exists in the project root. This file should contain:
- Schema creation (iam and core schemas)
- Table definitions
- Initial data/seed data

## Troubleshooting

### Port Already in Use
If ports 80, 4001, or 5432 are already in use:

```bash
# Check what's using the port
lsof -ti:80
lsof -ti:4001
lsof -ti:5432

# Kill the process (replace PID with actual process ID)
kill -9 <PID>
```

Or modify the ports in `docker-compose.yml`:
```yaml
ports:
  - "8080:80"  # Change host port to 8080
```

### Database Connection Issues
1. Ensure PostgreSQL container is healthy:
   ```bash
   docker-compose ps
   ```

2. Check backend logs:
   ```bash
   docker-compose logs backend
   ```

3. Verify database credentials in `.env` file

### Frontend Can't Connect to Backend
1. Check that backend is running:
   ```bash
   curl http://localhost:4001/health
   ```

2. Verify `VITE_API_BASE` environment variable in docker-compose.yml

### Clearing All Data
To start fresh with a clean database:
```bash
docker-compose down -v
docker-compose up --build
```

## Security Notes

⚠️ **IMPORTANT FOR PRODUCTION:**

1. **Change JWT_SECRET:** Use a strong, random secret key
2. **Change DB_PASSWORD:** Use a strong database password
3. **Use HTTPS:** Configure SSL/TLS certificates
4. **Environment Variables:** Never commit `.env` file to version control
5. **Update Default Credentials:** Change the default admin password

## Network Architecture

All services run in a custom bridge network (`team-mgmt-network`):
- Services can communicate using service names (e.g., `postgres`, `backend`)
- External access is controlled via port mappings
- Isolated from other Docker networks

## Volume Management

### Persistent Data
- `postgres_data`: PostgreSQL database files

### Backup Database
```bash
# Create backup
docker exec team-mgmt-db pg_dump -U postgres team_management > backup.sql

# Restore backup
docker exec -i team-mgmt-db psql -U postgres team_management < backup.sql
```

## CI/CD Integration

### Building Images
```bash
# Build backend image
docker build -t team-mgmt-backend:latest -f apps/resource-service/Dockerfile .

# Build frontend image
docker build -t team-mgmt-frontend:latest -f apps/web/Dockerfile apps/web
```

### Pushing to Registry
```bash
# Tag images
docker tag team-mgmt-backend:latest your-registry/team-mgmt-backend:latest
docker tag team-mgmt-frontend:latest your-registry/team-mgmt-frontend:latest

# Push to registry
docker push your-registry/team-mgmt-backend:latest
docker push your-registry/team-mgmt-frontend:latest
```
