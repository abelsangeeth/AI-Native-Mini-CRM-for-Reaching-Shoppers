# ==========================================
# STAGE 1: BUILD ENVIRONMENT
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy package config files
COPY package*.json tsconfig.json ./

# Install dependencies including devDependencies
RUN npm ci

# Copy source code files
COPY src/ ./src/

# Compile TypeScript to JavaScript in /dist
RUN npm run build

# ==========================================
# STAGE 2: PRODUCTION ENVIRONMENT
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=3000
ENV CHANNEL_PORT=3001
ENV CHANNEL_SERVICE_URL=http://localhost:3001/api/channel/send
ENV CRM_CALLBACK_URL=http://localhost:3000/api/callbacks/receipt

# Copy package configurations
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy compiled code from build stage
COPY --from=builder /usr/src/app/dist ./dist

# Copy public static frontend assets
COPY public/ ./public/

# Expose ports: 3000 (CRM) and 3001 (Channel simulator)
EXPOSE 3000
EXPOSE 3001

# Run database seeder and start services
CMD ["sh", "-c", "node dist/db/seed.js && node dist/index.js"]
