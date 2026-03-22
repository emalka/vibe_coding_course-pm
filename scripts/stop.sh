#!/bin/bash
set -e

CONTAINER_NAME="kanban-studio"

echo "Stopping Kanban Studio..."
docker rm -f "$CONTAINER_NAME" 2>/dev/null || echo "Container not running."

echo "Stopped."
