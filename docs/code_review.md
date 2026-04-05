# Code Review: Kanban Studio

**Date:** 2026-04-05
**Reviewer:** Claude Code
**Scope:** Full repository — backend, frontend, infrastructure, tests

---

## Executive Summary

The codebase is clean and well-structured for an MVP. Test coverage is solid (47 backend tests, 20 frontend unit tests, 17 E2E tests). However, there are several security, correctness, and performance issues to address before production use. This document lists every finding with file:line references, severity, and a concrete action.

---

## Severity Definitions

| Severity | Meaning |
|----------|---------|
| **Critical** | Must fix before any exposure |
| **High** | Fix before production |
| **Medium** | Fix in next iteration |
| **Low** | Nice-to-have / polish |

---

## Findings

### 1. Hardcoded default credentials
**File:** `backend/app/database.py:252`
**Severity:** Critical
**Issue:** Seed function hardcodes `username="user"`, `password="password"`. Anyone with repo access knows the login.
**Action:** Remove hardcoded password from source. Read initial credentials from `ADMIN_USERNAME` / `ADMIN_PASSWORD` environment variables at seed time. Document in README.

---

### 2. In-memory session store
**File:** `backend/app/main.py:23`
**Severity:** High
**Issue:** `sessions: dict[str, str] = {}` — all sessions lost on container restart; no expiry enforcement; not horizontally scalable.
**Action:** Store sessions in SQLite (a `sessions` table with `token`, `username`, `expires_at`) or Redis. Add expiry check on every request.

---

### 3. Missing CSRF protection
**File:** `backend/app/main.py` (all state-changing routes)
**Severity:** High
**Issue:** No CSRF token on POST/PUT/DELETE endpoints. Authenticated users are vulnerable to cross-site request forgery.
**Action:** Add double-submit cookie or synchronizer token. Validate `Origin`/`Referer` headers as minimum mitigation for a same-origin app.

---

### 4. Cookie SameSite=lax on session cookie
**File:** `backend/app/main.py:92`
**Severity:** High
**Issue:** `samesite="lax"` permits cross-site GET-initiated requests. For an auth cookie, `strict` is safer.
**Action:** Change to `samesite="strict"`. Add `secure=True` for HTTPS deployments.

---

### 5. Raw exception detail returned to client
**File:** `backend/app/main.py:226`
**Severity:** High
**Issue:** `f'"AI request failed: {exc}"'` embeds the raw Python exception in the HTTP response, leaking internal details.
**Action:** Return a generic message (`"AI request failed. Please try again."`). Log the full exception server-side with a request ID.

---

### 6. No input length/content validation
**File:** `backend/app/database.py` (all write functions), `backend/app/main.py` (all route handlers)
**Severity:** High
**Issue:** Card titles, column titles, and card details accept unbounded strings. No character or length limits enforced in Pydantic models or DB layer.
**Action:** Add Pydantic field constraints: `title: str = Field(..., max_length=255)`, `details: str = Field("", max_length=5000)`. Enforce at the model level so validation is automatic.

---

### 7. N+1 query pattern in board retrieval
**File:** `backend/app/database.py:81-96`
**Severity:** High
**Issue:** One query fetches all columns, then a separate query fetches cards for each column inside a loop. A 5-column board runs 6 queries.
**Action:** Replace with a single JOIN:
```sql
SELECT c.id, c.title, c.position,
       ca.id, ca.title, ca.details, ca.position
FROM columns c
LEFT JOIN cards ca ON ca.column_id = c.id
WHERE c.board_id = ?
ORDER BY c.position, ca.position
```
Group results in Python with a `dict` keyed on column id.

---

### 8. Race condition in move-card position updates
**File:** `backend/app/database.py:228-244`
**Severity:** High
**Issue:** Three sequential UPDATE statements adjust positions without an explicit transaction savepoint. Concurrent moves can produce duplicate or missing positions.
**Action:** Wrap the three UPDATEs in `with conn:` (or explicit `BEGIN IMMEDIATE`) so they are atomic. Add a test that fires two moves concurrently and asserts position uniqueness.

---

### 9. Full board state sent to AI on every message
**File:** `backend/app/ai.py:58-59`
**Severity:** High
**Issue:** `json.dumps(board, indent=2)` serializes the entire board into the system prompt on every request. Large boards inflate cost and latency; also sends all user data to a third-party API.
**Action:** Send a compact board summary (column names + card IDs/titles only). Strip `details` field unless the user's message references card content. Consider caching the serialized summary and invalidating on board mutation.

---

### 10. AI board updates applied without feedback on partial failure
**File:** `backend/app/main.py:233-254`
**Severity:** High
**Issue:** `_apply_board_updates()` silently skips failed operations (bad column ID, ownership check failure). Frontend only sees `board_updates_applied` count, not which operations failed or why.
**Action:** Return per-operation result: `{op: "create_card", success: false, reason: "column not found"}`. Log failures server-side. Display a user-facing message when any operation fails.

---

### 11. Inconsistent error response format
**File:** `backend/app/main.py` (lines 97, 116, 144, 200, 226)
**Severity:** Medium
**Issue:** Some responses use `{"ok": false, "detail": "..."}`, others use `{"detail": "..."}` alone, and the AI error uses its own format. Frontend must handle all three.
**Action:** Standardise on FastAPI's `HTTPException` throughout:
```python
raise HTTPException(status_code=401, detail="Not authenticated")
```
Delete all hand-rolled `Response(content='{"detail": ...}')` instances.

---

### 12. Position index edge case — NULL positions
**File:** `backend/app/database.py:135`
**Severity:** Medium
**Issue:** `COALESCE(MAX(position), -1)` returns -1 if all positions are NULL, giving the new card position 0 (duplicate risk if any card already sits at 0 due to a bug).
**Action:** Add `NOT NULL` constraint to `position` in the `CREATE TABLE` DDL. Add a data integrity check test that inserts a card into an empty column and verifies position = 0.

---

### 13. No request correlation ID
**File:** `backend/app/main.py`
**Severity:** Medium
**Issue:** No request ID generated or propagated. Debugging a failed AI call or card move requires trawling logs with no anchor.
**Action:** Add a middleware that generates a UUID per request, stores it in `request.state.request_id`, includes it in error responses, and logs it with every log line.

---

### 14. Pre-built `_401` response object
**File:** `backend/app/main.py:65`
**Severity:** Medium
**Issue:** `_401` is a module-level `Response` object. FastAPI may mutate `Response` objects (e.g., add headers), which would create subtle bugs when the same object is returned from multiple requests.
**Action:** Replace with `raise HTTPException(status_code=401, detail="Not authenticated")` in every call site.

---

### 15. No runtime validation of API response shapes in frontend
**File:** `frontend/src/lib/api.ts`
**Severity:** Medium
**Issue:** API responses are cast to TypeScript types without runtime validation. A backend schema change will cause a silent runtime error or cryptic crash.
**Action:** Add [Zod](https://zod.dev) schemas for `ApiBoard`, `ApiColumn`, `ApiCard`, and `ChatResponse`. Parse every response: `const board = ApiBoard.parse(data)`. This catches contract violations immediately.

---

### 16. Silent revert on failed optimistic update
**File:** `frontend/src/components/KanbanBoard.tsx:218-251`
**Severity:** Medium
**Issue:** When a card creation or rename API call fails, the UI reverts to prior state with no user-visible feedback. The user sees a card appear then vanish.
**Action:** Show an error toast on failure. Libraries like `react-hot-toast` are lightweight. Example: `toast.error("Failed to create card — please try again.")`.

---

### 17. DnD state race condition with `setTimeout(..., 0)`
**File:** `frontend/src/components/KanbanBoard.tsx:184`
**Severity:** Medium
**Issue:** `boardBeforeDrag.current` is read inside a `setTimeout`, but a second drag could start and overwrite it before the timeout fires.
**Action:** Capture the pre-drag snapshot into a local `const` before the timeout, not inside it. Disable drag interaction while a move API call is in flight.

---

### 18. Full board refetch after AI update
**File:** `frontend/src/components/KanbanBoard.tsx:308`, `backend/app/main.py`
**Severity:** Medium
**Issue:** After an AI operation, the frontend discards its state and re-fetches the whole board. On slow networks this is slow and causes a flash of empty state.
**Action:** Return the full updated board from `POST /api/ai/chat` and apply it directly: `setBoard(apiBoardToLocal(response.board))`. Eliminates the extra round-trip.

---

### 19. `board_updates_applied` typed as `unknown[]`
**File:** `frontend/src/lib/api.ts:110`
**Severity:** Low
**Issue:** `board_updates_applied: unknown[]` is only used for a length check. The type carries no information.
**Action:** Either type it properly (once the per-operation result structure is defined per finding #10), or if the field truly isn't used, simplify to `board_updated: boolean`.

---

### 20. Hardcoded AI model name
**File:** `backend/app/ai.py:7`
**Severity:** Low
**Issue:** `MODEL = "openai/gpt-oss-120b"` is hardcoded. Switching models requires a code change and redeploy.
**Action:** `MODEL = os.environ.get("AI_MODEL", "openai/gpt-oss-120b")`. Document the env var in `.env.example`.

---

### 21. Unused `createId` export
**File:** `frontend/src/lib/kanban.ts:164`
**Severity:** Low
**Issue:** `createId` is exported but not imported anywhere in the codebase.
**Action:** Delete it. If needed later, use the `uuid` package for collision-safe IDs (`Math.random()` is not cryptographically safe for IDs).

---

### 22. Accessibility gaps
**File:** `frontend/src/components/KanbanCard.tsx`, `KanbanColumn.tsx`, `ChatSidebar.tsx`
**Severity:** Low
**Issue:** Draggable cards have no `aria-grabbed` or `aria-roledescription`. Chat send button has no `aria-label` describing disabled state. Column title input is accessible but the inline save pattern has no announcement for screen readers.
**Action:** Add `role="button"` and `aria-label` to drag handles. Add `aria-live="polite"` to the chat message list so screen readers announce new messages.

---

### 23. Dockerfile cache bust on source copy
**File:** `Dockerfile:19`
**Severity:** Low
**Issue:** `COPY frontend/ frontend/` appears after `npm ci`, which is correct and cached — but `COPY backend/app/ backend/app/` follows `uv sync`. Any app code change invalidates the `uv sync` layer if `COPY backend/app/` comes after it. Currently the order is: `COPY pyproject.toml` → `uv sync` → `COPY app/` — which is correct. No action needed, just confirm layer order is maintained if Dockerfile is modified.
**Action:** No change needed; document the ordering intention with a comment.

---

### 24. No timestamps or audit trail in schema
**File:** `backend/app/database.py:20-43`
**Severity:** Low
**Issue:** Tables have no `created_at` or `updated_at` columns. Hard to know when data was created or answer "what changed recently?"
**Action:** Add `created_at INTEGER NOT NULL DEFAULT (unixepoch())` to `cards` and `columns`. Run as a migration script for existing databases.

---

### 25. No rate limiting
**File:** `backend/app/main.py`
**Severity:** Low
**Issue:** No rate limiting on any endpoint. The AI chat endpoint in particular could be expensive to abuse.
**Action:** Add [`slowapi`](https://github.com/laurentS/slowapi): 5 login attempts/minute/IP, 60 board operations/minute/user, 10 AI chat messages/minute/user.

---

## Testing Gaps

| Gap | Recommended Test |
|-----|-----------------|
| E2E tests share database, run in parallel | Add `beforeEach` DB reset or run with `--workers=1` |
| No concurrent move-card test | Parallel requests to `PUT /api/cards/:id/move` on same card |
| No real AI integration test | Skip-by-default test hitting real OpenRouter with `OPENROUTER_API_KEY` |
| No login brute-force test | 10 rapid failed logins → assert lock or rate limit |
| No large board performance test | Board with 20 columns × 50 cards → assert response time < 500 ms |
| AI chat: no malformed JSON response test | Mock OpenRouter returning invalid JSON → assert graceful error |

---

## Pre-Production Checklist

- [ ] Fix critical: default credentials from env vars (#1)
- [ ] Fix high: persistent session store (#2)
- [ ] Fix high: CSRF protection (#3)
- [ ] Fix high: cookie `secure=True` + `samesite="strict"` (#4)
- [ ] Fix high: sanitise exception messages (#5)
- [ ] Fix high: Pydantic field length constraints (#6)
- [ ] Fix high: N+1 query → JOIN (#7)
- [ ] Fix high: atomic transaction for card moves (#8)
- [ ] Enable HTTPS with a reverse proxy (nginx/caddy)
- [ ] Add security headers (CSP, HSTS, X-Frame-Options)
- [ ] Set up automated SQLite backup of `/data` volume
- [ ] Add monitoring / error tracking (e.g. Sentry)
- [ ] Rotate any API keys that were ever logged or exposed

---

## Summary Table

| # | File | Severity | Category |
|---|------|----------|----------|
| 1 | `database.py:252` | Critical | Security |
| 2 | `main.py:23` | High | Security |
| 3 | `main.py` | High | Security |
| 4 | `main.py:92` | High | Security |
| 5 | `main.py:226` | High | Security |
| 6 | `database.py` / `main.py` | High | Security |
| 7 | `database.py:81` | High | Performance |
| 8 | `database.py:228` | High | Correctness |
| 9 | `ai.py:58` | High | Architecture |
| 10 | `main.py:233` | High | Architecture |
| 11 | `main.py` (multiple) | Medium | Correctness |
| 12 | `database.py:135` | Medium | Correctness |
| 13 | `main.py` | Medium | Observability |
| 14 | `main.py:65` | Medium | Code Quality |
| 15 | `api.ts` | Medium | Frontend |
| 16 | `KanbanBoard.tsx:218` | Medium | Frontend UX |
| 17 | `KanbanBoard.tsx:184` | Medium | Correctness |
| 18 | `KanbanBoard.tsx:308` | Medium | Architecture |
| 19 | `api.ts:110` | Low | Code Quality |
| 20 | `ai.py:7` | Low | Code Quality |
| 21 | `kanban.ts:164` | Low | Code Quality |
| 22 | `components/` | Low | Accessibility |
| 23 | `Dockerfile:19` | Low | Infrastructure |
| 24 | `database.py:20` | Low | Design |
| 25 | `main.py` | Low | Security |
