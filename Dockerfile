# ---- Stage 1: Build the React frontend ----
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Install backend production dependencies ----
FROM node:20-alpine AS backend-deps
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev

# ---- Stage 3: Runtime image ----
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app/backend
COPY --from=backend-deps /app/backend/node_modules ./node_modules
COPY --from=frontend-build /app/frontend/dist ./public
COPY backend/ ./
EXPOSE 8080
CMD ["sh", "-c", "node src/utils/initDb.js && node src/server.js"]