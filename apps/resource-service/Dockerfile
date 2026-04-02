# Backend Service Dockerfile
FROM node:20-alpine
WORKDIR /app

# Copy package files from root context for the entire workspace
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/resource-service/package*.json ./apps/resource-service/

# Install dependencies (NPM will automatically link shared package)
RUN npm install

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/resource-service ./apps/resource-service

# Expose port
EXPOSE 4001

# Set working directory to the app
WORKDIR /app/apps/resource-service

# Start the application
CMD ["node", "index.js"]
