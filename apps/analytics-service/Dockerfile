# Analytics Service Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/

# Install dependencies
RUN npm install

# Copy shared package
COPY packages/shared ./packages/shared

# Copy application code
COPY apps/analytics-service ./apps/analytics-service

# Expose port
EXPOSE 4002

# Set working directory to analytics-service
WORKDIR /app/apps/analytics-service

# Start the application
CMD ["node", "index.js"]
