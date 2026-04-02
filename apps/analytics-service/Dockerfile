# Analytics Service Dockerfile
FROM node:20-alpine
WORKDIR /app

# Copy package files from root context for the entire workspace
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/analytics-service/package*.json ./apps/analytics-service/

# Install dependencies (NPM will automatically link shared package)
RUN npm install

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/analytics-service ./apps/analytics-service

# Expose port
EXPOSE 4002

# Set working directory to the app
WORKDIR /app/apps/analytics-service

# Start the application
CMD ["node", "index.js"]
