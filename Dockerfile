# ---- Builder Stage ----
# This stage installs all dependencies and builds the application.
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install all dependencies (including devDependencies for building)
RUN npm install

# Copy application source code
COPY . .

# Build the application
RUN npm run build

# ---- Pruning Stage ----
# This stage removes devDependencies to prepare for the production stage.
FROM node:18-alpine AS pruner

WORKDIR /usr/src/app

# Copy only the package files and the built application from the builder stage
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/dist ./dist

# Install only production dependencies
RUN npm install --omit=dev

# ---- Production Stage ----
# This is the final, lightweight image that will be deployed.
FROM node:18-alpine

# Set working directory
WORKDIR /usr/src/app

# Create a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Copy the pruned dependencies and the built application
COPY --from=pruner --chown=appuser:appgroup /usr/src/app/node_modules ./node_modules
COPY --from=pruner --chown=appuser:appgroup /usr/src/app/dist ./dist

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD ["node", "dist/main"]