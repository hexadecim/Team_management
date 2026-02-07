# Backend Service Dockerfile
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
COPY apps/resource-service ./apps/resource-service

# Expose port
EXPOSE 4001

# Set working directory to resource-service
WORKDIR /app/apps/resource-service

# Start the application
CMD ["node", "index.js"]
