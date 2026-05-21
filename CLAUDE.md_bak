# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kanban Studio — a single-user project management MVP with a Next.js frontend, Python FastAPI backend, SQLite database, and AI chat via OpenRouter. Deployed as a single Docker container serving the frontend as static files.

## Commands

### Frontend (`/frontend`)

```bash
npm run dev              # Dev server at http://localhost:3000
npm run build            # Static export to frontend/out/
npm run lint             # ESLint
npm run test             # Run unit tests
npm run test:unit        # Unit tests (Vitest)
npm run test:unit:watch  # Unit tests in watch mode
npm run test:e2e         # E2E tests (Playwright, requires dev server)
npm run test:all         # Unit + E2E
```

Run a single test file:
```bash
npx vitest run src/components/KanbanBoard.test.tsx
```

### Backend (`/backend`)

```bash
uv run uvicorn app.main:app --reload --port 8000  # Dev server
uv run pytest                                       # All tests
uv run pytest tests/test_auth.py                   # Single file
uv run pytest -k "test_login"                      # Single test by name
```

### Docker (full stack)

```bash
./scripts/start.sh   # Build image and run container at http://localhost:8000
./scripts/stop.sh    # Stop and remove container
```

Integration test against running container:
```bash
bash scripts/integration_test.sh
```

## Architecture

### Request Flow

```
Browser → FastAPI (port 8000)
           ├── Static files (Next.js export at /frontend/out/) → served at /
           └── /api/* → FastAPI route handlers
                         ├── Session auth (in-memory dict, httpOnly cookie)
                         ├── SQLite (/data/kanban.db via WAL mode)
                         └── AI calls → OpenRouter API
```

### Frontend (`/frontend/src`)

- **`app/page.tsx`** — Root: shows `LoginForm` or `KanbanBoard` based on auth state
- **`lib/api.ts`** — All HTTP calls to `/api/*`; transforms between API format and local state
- **`lib/kanban.ts`** — Board data types and pure logic helpers
- **`components/KanbanBoard.tsx`** — Main board: fetches data, owns board state, passes down
- **`components/ChatSidebar.tsx`** — AI chat panel; sends conversation history to `/api/ai/chat` and applies returned board updates

DnD uses `@dnd-kit` (core + sortable). Styling uses Tailwind v4 with CSS variables defined in `globals.css`.

### Backend (`/backend/app`)

- **`main.py`** — All FastAPI routes, session store, static file mount, lifespan DB init
- **`database.py`** — All SQLite CRUD; single connection pool; seeded with 1 user (`user`/`password`), 1 board, 5 columns, 8 cards
- **`ai.py`** — OpenRouter client; builds system prompt with full board context; parses structured output for board mutations

### Database

SQLite at `/data/kanban.db` (Docker volume `kanban-data`). Schema: `users → boards → columns → cards` with `position` ordering on columns and cards. See `docs/DATABASE.md` for full schema.

### Auth

Single hardcoded user. Session tokens stored in a Python dict in `main.py`. Frontend stores session cookie (httpOnly); all `/api/*` routes except `/api/login` return 401 if unauthenticated.

### AI Integration

`POST /api/ai/chat` accepts `{ message, conversation_history[] }`. The backend injects the current board state into the system prompt, calls OpenRouter, parses any board operations from the response (add/move/delete cards, rename columns), applies them to SQLite, and returns `{ message, board_updates_applied[] }` so the frontend can refresh.

## Coding Conventions (from AGENTS.md)

- Use latest stable library versions
- Async FastAPI handlers with type hints and Pydantic models
- Keep code simple and concise — no over-engineering
- No emojis in code or UI
- Backend tests use a temp SQLite DB (`conftest.py` fixture `setup_test_db`)
