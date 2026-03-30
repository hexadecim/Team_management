# Frontend Web Application Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app/apps/web

# Copy package files from root context
COPY apps/web/package*.json ./

# Install dependencies
RUN npm install

# Copy application code from root context
COPY apps/web ./

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets from builder
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy nginx configuration from root context
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
