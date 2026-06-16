# Overview

The server includes the backend component described in this document and the solution database described in ../database/database.md

# Technology Stack

- **Backend:** 
  - Stack: FastAPI, Uvicorn, Python 3.13, `uv` package manager, Pydantic
  - DB: SQLite at `/data/kanban.db` (Docker volume `kanban-data`), WAL mode
  - Testing: pytest + httpx TestClient

- **AI:** 
  - OpenRouter, model `openai/gpt-oss-120b`, key in root `.env` as `OPENROUTER_API_KEY`


# Project Structure

- Source Root - `/backend/app`
- `main.py` — all FastAPI routes, session store, static mount, lifespan DB init
- `database.py` — all SQLite CRUD, single connection pool; seeds 1 user, 1 board, 5 columns, 8 cards
- `ai.py` — OpenRouter client; injects board state into system prompt; parses board mutations from response

## Backend Commands

The backend code is in the `/backend` folder. The commands relevant to the Backend project are:

```bash
uv run uvicorn app.main:app --reload --port 8000
uv run pytest
uv run pytest tests/test_auth.py
uv run pytest -k "test_login"
```

### Docker Commands

```bash
./scripts/start.sh                  # build + run at http://localhost:8000
./scripts/stop.sh
bash scripts/integration_test.sh    # test running container
```

# Capabilities

## User Authentication

Single hardcoded user. Sessions in a Python dict in `main.py`. httpOnly cookie. All `/api/*` except `/api/login` return 401 if unauthenticated.

## AI Integration

`POST /api/ai/chat` with `{ message, conversation_history[] }`. Backend injects current board into system prompt, calls OpenRouter, parses operations (add/move/delete cards, rename columns), applies to SQLite, returns `{ message, board_updates_applied[] }` so the frontend can refresh.

## Coding Conventions

- Async handlers, type hints everywhere, Pydantic models for request/response.
- Keep routes in `main.py` until complexity demands splitting.
- Tests use a temp SQLite DB via `conftest.py` fixture `setup_test_db`.