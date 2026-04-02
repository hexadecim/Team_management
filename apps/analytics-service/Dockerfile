# Analytics Service Dockerfile
FROM node:20-alpine
WORKDIR /app

# Copy shared and app package files from root context
COPY packages/shared/package*.json ./packages/shared/
COPY apps/analytics-service/package*.json ./apps/analytics-service/

# Install dependencies in the app directory
WORKDIR /app/apps/analytics-service
RUN npm install

# Copy source code from root context
COPY packages/shared /app/packages/shared
COPY apps/analytics-service ./

# Expose port
EXPOSE 4002

# Start the application
CMD ["node", "index.js"]
