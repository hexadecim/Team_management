# Backend Service Dockerfile
FROM node:20-alpine
WORKDIR /app

# Copy shared and app package files from root context
COPY packages/shared/package*.json ./packages/shared/
COPY apps/resource-service/package*.json ./apps/resource-service/

# Install dependencies in the app directory
WORKDIR /app/apps/resource-service
RUN npm install

# Copy source code from root context
COPY packages/shared /app/packages/shared
COPY apps/resource-service ./

# Expose port
EXPOSE 4001

# Start the application
CMD ["node", "index.js"]
