# Event Bus Dockerfile
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
COPY apps/event-bus ./apps/event-bus

# Expose port
EXPOSE 4005

# Set working directory to event-bus
WORKDIR /app/apps/event-bus

# Start the application
CMD ["node", "index.js"]
