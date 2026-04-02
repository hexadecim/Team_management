# Event Bus Dockerfile
FROM node:20-alpine
WORKDIR /app

# Copy shared and app package files from root context
COPY packages/shared/package*.json ./packages/shared/
COPY apps/event-bus/package*.json ./apps/event-bus/

# Install dependencies in the app directory
WORKDIR /app/apps/event-bus
RUN npm install

# Copy source code from root context
COPY packages/shared /app/packages/shared
COPY apps/event-bus ./

# Expose port
EXPOSE 4005

# Start the application
CMD ["node", "index.js"]
