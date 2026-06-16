# Backend Code Review

Scope: `backend/app/{main.py, database.py, ai.py}`.
Severity legend: **HIGH** (correctness/security bug), **MED** (latent bug or design risk), **LOW** (polish, dead code, docs).

## Table of Contents

- [HIGH — Security](#high--security)
- [HIGH — Correctness](#high--correctness)
- [MED — Correctness / Concurrency](#med--correctness--concurrency)
- [MED — Design](#med--design)
- [LOW — Hygiene](#low--hygiene)
- [Tests not covered above](#tests-not-covered-above)

---

## HIGH — Security

### 1. Session cookie is not `Secure`
`main.py:114-120` — `response.set_cookie` sets `httponly=True` and `samesite="strict"` but does NOT set `secure=True`. Over HTTP (or a misconfigured reverse proxy in front of the container) the session token travels in cleartext. Behind HTTPS this should always be `secure=True`. Recommendation: read from env (`SESSION_COOKIE_SECURE`) and default to true in production.

### 2. No rate limiting on `POST /api/login`
`main.py:109-121` — credentials are checked against bcrypt with no throttling. Bcrypt is slow, which helps, but an attacker can still mount unlimited attempts. Add a simple per-IP/per-username backoff or use a middleware (e.g. `slowapi`).

### 3. AI-driven board ops trust unvalidated keys
`main.py:208-228` — `_apply_board_updates` does `op["column_id"]`, `op["title"]`, `op["card_id"]` with plain subscripting. If the model omits a required field (or returns the wrong type), the loop raises `KeyError`/`TypeError`, which is **not** caught by the `try/except` around `chat_with_board` (that try ends at line 201). Result: a malformed model response → uncaught 500 with stack trace. Validate each op via a Pydantic model (`CreateCardOp`, `MoveCardOp`, etc.) before applying, and skip invalid ops with a `success: false` entry rather than crashing the request.

---

## HIGH — Correctness

### 4. `move_card` doesn't bound-check `target_position`
`database.py:284-338` — there is no check that `0 <= target_position <= len(column)`. A client (or the AI) can send `position: 9999`; the function happily writes the card at position 9999, leaving the column with non-contiguous positions (`0, 1, 9999`). Subsequent moves keep working but the gap persists in storage and can confuse future reorders. Clamp `target_position` to `[0, count_in_target_column]` (accounting for whether the card is moving within the same column).

### 5. AI response parser only handles a leading code fence
`ai.py:94-105` — `_parse_ai_response` strips the first and last lines if the text starts with ```` ``` ````. Models commonly add prose around the fence ("Here you go:\n\`\`\`json\n{...}\n\`\`\`") or omit the closing fence on truncation. Either case raises `JSONDecodeError`, which surfaces as a 502 to the user. Two fixes worth considering:
- Switch to OpenAI's `response_format={"type": "json_object"}` (supported by OpenRouter for many models) and drop the markdown stripping entirely.
- As a fallback, search for the first `{` and parse a balanced JSON substring instead of relying on fence position.

---

## MED — Correctness / Concurrency

### 6. `create_card` is not atomic — duplicate positions under concurrency
`database.py:203-234` — reads `MAX(position)` then `INSERT` without a `BEGIN IMMEDIATE`. Two concurrent creates on the same column can both observe the same max and insert with the same `position`. Single-user MVP makes this unlikely, but the same pattern would silently corrupt ordering once multi-user lands. Wrap in `BEGIN IMMEDIATE ... COMMIT` like `move_card` does.

### 7. `update_card` is not atomic across fields
`database.py:237-257` — `title` and `details` are written in two separate `UPDATE`s with no transaction. If a failure happens between them, the card ends up with one field updated and the other not. Wrap both updates in a single transaction (or build one parameterized UPDATE that sets only the provided fields).

### 8. `delete_card` has TOCTOU between SELECT and position fix-up
`database.py:260-281` — same shape as above: ownership check + delete + reorder in three separate statements. Wrap in `BEGIN IMMEDIATE`.

### 9. Expired sessions are never deleted
`database.py:83-92` — `get_session_user` filters by `expires_at > now()` but nothing ever removes rows that fell past it. The `sessions` table grows monotonically. Add a sweep on `init_db` (or on session creation) that deletes `WHERE expires_at <= ?`.

---

## MED — Design

### 10. Docs say "single connection pool"; code opens a connection per call
Docs claim a pooled connection (`project_docs/agents/main.md:75`), but every helper in `database.py` calls `get_connection()` which does `sqlite3.connect(...)`. Each call also re-issues `PRAGMA journal_mode=WAL` and `PRAGMA foreign_keys=ON`. For SQLite this is mostly fine, but the docs and code disagree — pick one. If you want a real pool, hold a module-level connection guarded by a lock; if not, fix the docs.

### 11. `OPENROUTER_API_KEY` accessed via raw `os.environ[...]`
`ai.py:40` — raises `KeyError` if the lifespan check is ever bypassed (tests that monkeypatch env, or future code that calls `chat_completion` before startup). The lifespan check in `main.py:70-74` only fires for the FastAPI app; tests that import `app.ai` directly skip it. Prefer `os.environ.get(...)` with an explicit `RuntimeError("OPENROUTER_API_KEY not set")`.

### 12. New `OpenAI` client per request
`ai.py:39-41` — each call constructs a new client. The OpenAI SDK pools HTTP connections internally per client, so the per-request construction throws those away. Hold one module-level client and reuse it.

### 13. `_compact_board` JSON sent to model uses `indent=2`
`ai.py:78` — pretty-printing wastes input tokens at no benefit (the model doesn't need indentation). Drop `indent=2`.

### 14. `samesite="strict"` may break OAuth-style flows later
`main.py:118` — fine for the MVP (no third-party redirects). Worth a comment so a future contributor doesn't trip on this when adding OAuth.

---

## LOW — Hygiene

### 15. `_seed` hardcodes `board_id=1` and column IDs 1–5
`database.py:351, 366-380` — the seed inserts cards into `column_id` 1..5 assuming AUTOINCREMENT yielded those exact values. It works today because the seed only runs on an empty DB, but it's brittle. Capture `cursor.lastrowid` from each insert and use it.

### 16. `chat_completion` is only used by `/api/ai/test`
`main.py:231-239` and `ai.py:64-71` — leftover scaffolding from Part 8 of the plan. If it's not part of the production surface, delete the route and the function. If it stays, add an auth/admin gate or remove from the OpenAPI schema; right now any logged-in user can burn tokens on a hardcoded prompt.

### 17. `clear_all_sessions` lives in production module but is "for tests"
`database.py:104-111` — exported from `database.py` and imported by `main.py` (unused in main.py). Move to a test helper, or at least drop the unused import.

### 18. AI op envelope is unbounded
`ChatRequest` caps `conversation_history` at 20 turns (good) but the AI's `board_updates` array has no cap. A misbehaving model could return hundreds of ops in one turn, each hitting the DB. Cap to e.g. 50 and reject the rest.

### 19. Generic 502 hides the actual AI failure
`main.py:197-201` — catching bare `Exception` and returning "AI request failed" makes debugging hard. At minimum log the request_id (already on `request.state`) and the error class.

### 20. `STATIC_DIR` resolves to `<repo>/frontend/out` from `backend/app/main.py`
`main.py:30` — `Path(__file__).resolve().parent.parent.parent / "frontend" / "out"`. That's three `parent` calls from `backend/app/main.py`, which lands at `<repo>/frontend/out`. Fine inside Docker where the Dockerfile must place the build there; verify the Dockerfile actually copies to that path, otherwise the static mount silently no-ops and the frontend 404s.

---

## Tests not covered above
Backend tests (`tests/test_*.py`) were not reviewed in depth. Worth a quick pass to confirm `move_card` is tested for cross-column moves *and* same-column up/down moves (the position-shift logic is the trickiest part of the codebase).
