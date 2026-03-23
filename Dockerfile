FROM python:3.13-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Install Node.js for frontend build
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm && rm -rf /var/lib/apt/lists/*

# Build frontend static export
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci
COPY frontend/ frontend/
RUN cd frontend && npm run build

# Copy backend dependency definition and install
COPY backend/pyproject.toml backend/pyproject.toml
RUN cd backend && uv sync --no-dev

# Copy backend source (without overwriting .venv)
COPY backend/app/ backend/app/
COPY backend/AGENTS.md backend/AGENTS.md

# Create data directory for SQLite
RUN mkdir -p /data

EXPOSE 8000

CMD ["backend/.venv/bin/uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
