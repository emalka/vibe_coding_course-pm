#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "Project directory: $PROJECT_DIR"
CONTAINER_NAME="kanban-studio"
IMAGE_NAME="kanban-studio"

echo "Building Docker image..."
docker build -t "$IMAGE_NAME" "$PROJECT_DIR"

# Stop existing container if running
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

echo "Starting container..."
docker run -d \
  --name "$CONTAINER_NAME" \
  -p 8000:8000 \
  --env-file "$PROJECT_DIR/.env" \
  -v kanban-data:/data \
  "$IMAGE_NAME"

echo "Kanban Studio is running at http://localhost:8000"
