# ── Build Phase 1: Compile static React/Next.js frontend ──────────────────────
FROM node:18-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci --quiet
COPY frontend/ ./
# Static export generated inside /frontend/out
RUN npm run build

# ── Build Phase 2: Python FastAPI production server ───────────────────────────
FROM python:3.12-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install python requirements
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend codebase
COPY backend/ ./

# Copy statically compiled frontend from builder phase into the mount directory
COPY --from=frontend-builder /frontend/out /frontend/out

# Expose port and run
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
