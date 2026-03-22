# Backend - Kanban Studio API

## Overview

Python FastAPI backend serving the Kanban Studio API and static frontend. Packaged in Docker, uses uv for package management.

## Structure

```
backend/
  pyproject.toml          # Dependencies (managed by uv)
  app/
    __init__.py
    main.py               # FastAPI app, routes
```

## Stack

- **Framework:** FastAPI
- **Server:** Uvicorn
- **Package manager:** uv
- **Database:** SQLite at /data/kanban.db (Docker volume)
- **Python:** 3.13

## API Routes

- GET / - serves static frontend (hello world placeholder for now)
- GET /api/health - health check

## Coding Conventions

- Use async route handlers.
- Type hints on all function signatures.
- Keep routes in main.py until complexity warrants splitting.
- Use Pydantic models for request/response schemas.
- Tests use pytest + httpx (TestClient).