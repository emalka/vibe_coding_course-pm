# Project Plan

## Decisions Log

- Auth: session cookie from FastAPI; password verified via bcrypt against SQLite (single seeded user for MVP)
- AI conversation history: in-memory per browser session (not persisted in DB for MVP)
- Docker base image: latest python slim
- SQLite location: /data/kanban.db inside container, mounted as a Docker volume for persistence
- OpenRouter model: openai/gpt-oss-120b
- Scripts: Mac only (start.sh / stop.sh); others on request
- Frontend AGENTS.md: documents existing code + coding conventions

---

## Part 1: Plan

- [x] Enrich PLAN.md with detailed substeps, checklists, tests, and success criteria
- [x] Create frontend/AGENTS.md describing existing code and coding conventions
- [x] User approves the plan

**Success criteria:** User confirms the plan is good to proceed.

---

## Part 2: Scaffolding

Set up Docker, FastAPI backend, and start/stop scripts. Serve a hello world page and a test API endpoint.

- [x] Create backend/requirements.txt (or pyproject.toml for uv) with FastAPI, uvicorn
- [x] Create backend/app/main.py with FastAPI app
  - GET / returns a simple HTML hello world page
  - GET /api/health returns { "status": "ok" }
- [x] Create Dockerfile in project root
  - Based on latest python slim image
  - Install uv, then use uv to install Python dependencies
  - Copy backend code
  - Expose port 8000
  - CMD: uvicorn
- [x] Create .dockerignore
- [x] Create scripts/start.sh (Mac)
  - Builds Docker image
  - Runs container, passing .env, mounting volume for SQLite
- [x] Create scripts/stop.sh (Mac)
  - Stops and removes the container
- [x] Update backend/AGENTS.md with backend description

### Tests & Success Criteria

- [x] `scripts/start.sh` builds and starts the container without errors
- [x] `curl http://localhost:8000/` returns hello world HTML
- [x] `curl http://localhost:8000/api/health` returns `{"status": "ok"}`
- [x] `scripts/stop.sh` stops the container cleanly

---

## Part 3: Add in Frontend

Build the Next.js frontend as a static export and serve it from FastAPI.

- [x] Update next.config.ts to enable static export (`output: 'export'`)
- [x] Update Dockerfile to:
  - Install Node.js
  - Run `npm ci && npm run build` in frontend/
  - Copy the static output (frontend/out/) to a location FastAPI can serve
- [x] Update FastAPI to serve the static files at / using StaticFiles mount
- [x] Remove the hello world route (replaced by frontend)
- [x] Keep /api/health endpoint

### Tests & Success Criteria

- [x] Docker build completes (frontend builds successfully as static export)
- [x] `curl http://localhost:8000/` returns the Kanban board HTML
- [x] Browser: navigating to http://localhost:8000 shows the working Kanban board with drag-and-drop
- [x] `curl http://localhost:8000/api/health` still returns `{"status": "ok"}`
- [x] Frontend unit tests pass: `npm run test:unit` (run locally, 6/6 pass)

---

## Part 4: Fake User Sign In

Add login/logout with hardcoded credentials (user/password). Session cookie auth.

- [x] Backend: POST /api/login (accepts { username, password }, sets session cookie, returns success/error)
- [x] Backend: POST /api/logout (clears session cookie)
- [x] Backend: GET /api/me (returns current user if authenticated, 401 otherwise)
- [x] Frontend: Create a Login page/component
  - Form with username + password fields
  - Purple submit button, project color scheme
  - Error message on wrong credentials
- [x] Frontend: Update page.tsx to check auth state
  - If not logged in, show Login
  - If logged in, show KanbanBoard + logout button
- [x] Frontend: Add logout button to the board header

### Tests & Success Criteria

- [x] Backend unit tests: login with correct/incorrect creds, session validation, logout
- [x] Frontend component test: Login form renders, submits, shows error
- [x] Frontend component test: Board shows only when authenticated
- [x] E2E: full login -> see board -> logout -> see login flow
- [x] Refreshing the page while logged in keeps you logged in (cookie persistence)

---

## Part 5: Database Modeling

Design and document the SQLite schema for the Kanban board.

- [x] Create docs/DATABASE.md with schema design
- [x] Create docs/schema.json with the schema in JSON format
- [x] Schema must support:
  - Users table (id, username, password_hash) - multi-user ready
  - Boards table (id, user_id, name)
  - Columns table (id, board_id, title, position)
  - Cards table (id, column_id, title, details, position)
- [x] Document the SQLite file location (/data/kanban.db) and volume mount strategy
- [x] Get user sign-off on schema

### Tests & Success Criteria

- [x] Schema is normalized and supports future multi-user
- [x] Schema supports card ordering (position field)
- [x] User approves the schema

---

## Part 6: Backend API

Implement CRUD API routes for the Kanban board backed by SQLite.

- [x] Create database module (backend/app/database.py)
  - SQLite connection setup
  - Auto-create tables if DB doesn't exist
  - Seed default board for "user" if empty
- [x] API routes:
  - GET /api/board - get the full board (columns + cards) for current user
  - PUT /api/columns/:id - rename a column
  - POST /api/cards - create a card in a column
  - PUT /api/cards/:id - update card title/details
  - DELETE /api/cards/:id - delete a card
  - PUT /api/cards/:id/move - move a card (change column and/or position)
- [x] All routes require authentication (session cookie check)

### Tests & Success Criteria

- [x] Backend unit tests for each route (happy path + error cases)
- [x] Test DB auto-creation: delete DB file, restart, DB is recreated
- [x] Test auth: all /api/board and /api/cards routes return 401 without session
- [x] Test CRUD: create, read, update, delete cards via API
- [x] Test move: card moves between columns, positions update correctly

---

## Part 7: Frontend + Backend Integration

Connect the frontend to the backend API so the Kanban board is persistent.

- [x] Create frontend API client module (src/lib/api.ts)
  - Functions: fetchBoard, renameColumn, createCard, updateCard, deleteCard, moveCard
- [x] Update KanbanBoard to:
  - Fetch board from API on mount
  - Call API on every user action (rename, add, delete, drag-drop)
  - Optimistic updates: update local state immediately, revert on API error
- [x] No API proxy needed: static export served by FastAPI on same origin
- [x] Handle loading and error states in the UI

### Tests & Success Criteria

- [x] Frontend unit tests with mocked API calls
- [x] E2E: add card -> refresh page -> card persists
- [x] E2E: rename column -> refresh -> name persists
- [x] E2E: drag card to new column -> refresh -> card is in new column
- [x] E2E: delete card -> refresh -> card is gone
- [x] E2E: two browser tabs show consistent state after refresh (implicit: all data from DB)

---

## Part 8: AI Connectivity

Connect backend to OpenRouter API. Verify with a simple test.

- [ ] Add openai (or httpx) to backend dependencies
- [ ] Create backend/app/ai.py module
  - Function to call OpenRouter with a prompt
  - Uses OPENROUTER_API_KEY from environment
  - Model: openai/gpt-oss-120b
- [ ] Create test route: POST /api/ai/test (sends "What is 2+2?" and returns the response)
- [ ] Pass .env to Docker container in start.sh

### Tests & Success Criteria

- [ ] Backend unit test with mocked OpenRouter response
- [ ] Manual test: `curl -X POST http://localhost:8000/api/ai/test` returns a response containing "4"
- [ ] Error handling: returns meaningful error if API key is missing or invalid

---

## Part 9: AI Kanban Integration

AI receives the board state + user question, responds with structured output that can update the board.

- [ ] Define structured output schema:
  - `message`: string (AI's text response to user)
  - `board_updates`: optional array of operations (create_card, update_card, move_card, delete_card)
- [ ] Create POST /api/ai/chat endpoint
  - Accepts: { message, conversation_history[] }
  - Sends to AI: system prompt with board JSON + user message + history
  - Parses structured output
  - Applies board_updates to the database if present
  - Returns: { message, board_updates_applied }
- [ ] System prompt instructs the AI on the board schema and available operations

### Tests & Success Criteria

- [ ] Backend unit tests with mocked AI responses (with and without board updates)
- [ ] Test: AI creates a card -> card appears in DB
- [ ] Test: AI moves a card -> card position updated in DB
- [ ] Test: AI responds without updates -> no DB changes
- [ ] Test: conversation history is sent correctly

---

## Part 10: AI Chat Sidebar

Add a chat sidebar to the frontend for AI interaction.

- [ ] Create ChatSidebar component
  - Collapsible panel on the right side
  - Message list (user + AI messages)
  - Text input + send button
  - Loading indicator during AI calls
  - Conversation history maintained in component state (in-memory)
- [ ] Integrate with POST /api/ai/chat
- [ ] When AI returns board_updates_applied, re-fetch the board to show changes
- [ ] Style to match project color scheme
- [ ] Toggle button to open/close sidebar

### Tests & Success Criteria

- [ ] Component test: sidebar renders, accepts input, displays messages
- [ ] Component test: loading state during AI call
- [ ] E2E: send message -> receive AI response in chat
- [ ] E2E: ask AI to create a card -> card appears on board without page refresh
- [ ] E2E: ask AI to move a card -> board updates automatically
- [ ] Chat history persists within same session, clears on page refresh