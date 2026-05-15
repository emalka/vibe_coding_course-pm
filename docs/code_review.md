# Code Review — Kanban Studio

**Reviewed:** 2026-05-02
**Scope:** Full repository — backend (`/backend`), frontend (`/frontend`), infrastructure (`Dockerfile`, `/scripts`), tests, docs.
**Build status at review:** all 108 tests pass (47 pytest + 20 vitest + 24 integration + 17 Playwright with `--workers=1`).

This review is intentionally critical. The MVP is in good shape and ships a working end-to-end Kanban + AI experience, so the goal here is to flag what would matter when this is no longer a single-user local toy. Each finding is graded for the project's actual context (single-user, local Docker, MVP), not for a generic enterprise app.

---

## 1. Executive summary

**Strengths.** Architecture is clean and matches the docs. The board fetch uses a single JOIN (no N+1). `move_card` is correctly atomic via `BEGIN IMMEDIATE`. Pydantic validation is applied to every mutating endpoint with reasonable length caps. The frontend's optimistic-update + rollback pattern is consistent across add/move/delete. AGENTS.md conventions are well-followed: TS strict (zero `any` in `src/`), no default exports outside pages, business logic in `src/lib/`, no emojis. Tests are comprehensive (108 across 4 layers).

**Where to invest next.** Three themes: (1) **AI ingress hardening** — unbounded conversation history, no request timeout, and silent fallback on missing API key are the most exploitable surface; (2) **`KanbanBoard.tsx` size and the move-end persistence path** — the component is approaching unmaintainable and the post-drag `setTimeout(…, 0)` has a real rollback hole; (3) **test isolation** — Playwright runs against a shared SQLite, which is why three E2E tests fail under the default parallelism even though the code is correct.

---

## 2. Findings by severity

### Critical

**C1. AI key missing → silent fallback** — `backend/app/ai.py:40`
```python
api_key = os.environ.get("OPENROUTER_API_KEY", "")
```
If `OPENROUTER_API_KEY` is unset, the OpenAI client is constructed with an empty string and only fails at call time as a generic 502 from the FastAPI handler. There is no startup-time check, so the container appears healthy until the first chat request. **Fix:** read with `os.environ["OPENROUTER_API_KEY"]` (or validate on startup in `lifespan`) so the container fails fast at boot if the key is missing. The current default is also indistinguishable from a typo (e.g. `OPENROUTER_KEY`).

**C2. Conversation history is unbounded and unvalidated** — `backend/app/main.py:55–57`, `backend/app/ai.py:81–83`
```python
class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    conversation_history: list[dict] = []
```
Any authenticated client can post a 10 MB `conversation_history` and the server will forward every byte to OpenRouter. Costs scale linearly with caller-controlled input, and the model will eventually 400 with no helpful error. **Fix:** define a `ConversationTurn` Pydantic model (`role: Literal["user","assistant"]`, `content: str` with a max_length) and a list-level cap (e.g. last 20 turns) before forwarding.

---

### High

**H1. No timeout or retry budget on OpenRouter calls** — `backend/app/ai.py:39–41, 67, 85`
The `OpenAI` client uses its default timeout. A slow upstream stalls a worker indefinitely from the user's perspective. **Fix:** `OpenAI(base_url=..., api_key=..., timeout=30.0)`. Optional: configure `max_retries` explicitly (the SDK retries by default, but make the policy intentional).

**H2. `KanbanBoard.tsx` is doing too much** — `frontend/src/components/KanbanBoard.tsx` (405 lines)
One component owns: data fetching, optimistic CRUD, custom collision detection, drag-over re-shuffle, drag-end persistence, debounced rename, AI-driven board refresh, error banner state, and presentation. This violates the AGENTS.md rule "business logic goes in `src/lib/`." **Fix:** extract three hooks — `useBoard()` (fetch + optimistic CRUD), `useBoardDnd(board, setBoard)` (sensors, collision detection, drag handlers), and `useDebouncedColumnRename(setBoard)` — leaving the component as a thin presentation layer. This will also unblock unit-testing the DnD logic, which today is only covered indirectly via Playwright.

**H3. Move-card rollback uses a stale snapshot** — `frontend/src/components/KanbanBoard.tsx:140–198`
After `handleDragEnd`, the code captures `preDragBoard` (good), then schedules the API call inside a `setTimeout(…, 0)`. If the user immediately starts a *second* drag before the first `moveCardApi` rejects, the rollback writes the snapshot from drag #1 over the state shaped by drag #2. The `boardBeforeDrag.current = null` line was added to mitigate this but it does not help — `preDragBoard` is already a closed-over reference that points to the old board. **Fix:** either (a) serialize move calls (don't accept a new `onDragStart` while one is in flight, or `await` the API before clearing `activeCardId`), or (b) on failure, refetch from the server instead of rolling back from a snapshot. Refetch is simpler and consistent with how the AI chat path already handles updates.

**H4. Optimistic temp IDs can collide** — `frontend/src/components/KanbanBoard.tsx:225`
```tsx
const tempId = `temp-${Date.now()}`;
```
Two cards added in the same millisecond (e.g. quick double-click on "Add card", or two columns clicked in rapid succession) generate the same `tempId`. The replace-temp-id-with-real-id step in the success branch then overwrites both rows. **Fix:** use `crypto.randomUUID()` (already available in modern browsers) or the existing `createId("temp")` helper from `lib/kanban.ts:164` — which combines `Math.random` + `Date.now`.

**H5. Playwright tests are not isolated from each other** — `frontend/playwright.docker.config.ts`, `frontend/playwright.config.ts`
The default `workers` is `os.cpus()/2`, and every worker hits the same SQLite-backed `/api/board`. Three tests in `kanban.spec.ts` and `dnd_empty_column.spec.ts` fail under parallelism because seed counts get clobbered — verified during the test run preceding this review. **Fix:** the cheapest correct option is `workers: 1` (or `fullyParallel: false`) in the docker config. The principled option is a per-test reset endpoint (e.g. `POST /api/test/reset` gated by an env flag) called in `beforeEach`. Without one of these, the suite is forever flaky.

---

### Medium

| ID  | Finding                                                          | Location |
|-----|------------------------------------------------------------------|----------|
| M1  | `delete_card` is not transactional                               | `backend/app/database.py:260–281` |
| M2  | `update_card` silently no-ops when both fields are null          | `backend/app/database.py:237–257`, `backend/app/main.py:154–159` |
| M3  | AI response parser raises on malformed output                    | `backend/app/ai.py:94–110` |
| M4  | `_apply_board_updates` does no shape validation                  | `backend/app/main.py:195–215` |
| M5  | SQLite has no indexes on hot lookup columns                      | `backend/app/database.py:25–57` |
| M6  | Foreign keys without `ON DELETE CASCADE`                         | `backend/app/database.py:34–51` |
| M7  | `chat_with_board` re-fetches board after applying updates        | `backend/app/main.py:181–192` |
| M8  | `request_id_middleware` produces an ID nobody uses               | `backend/app/main.py:69–76` |
| M9  | API client error handling discards the body                      | `frontend/src/lib/api.ts:40–46` |
| M10 | `ChatSidebar` uses array index as React key                      | `frontend/src/components/ChatSidebar.tsx:111–113` |
| M11 | `sendChatMessage` drops `success: false` results onto the floor  | `frontend/src/components/ChatSidebar.tsx:47–50` |
| M12 | `secure` flag missing on session cookie (deferred until HTTPS)   | `backend/app/main.py:102–108` |
| M13 | `setTimeout(…, 0)` in DnD path obscures intent                   | `frontend/src/components/KanbanBoard.tsx:184` |
| M14 | Backend tests don't cover concurrent or cross-user paths         | `backend/tests/` |

**M1. `delete_card` is not transactional** — `backend/app/database.py:260–281`
The DELETE and the position-renumber UPDATE run in two separate statements with no `BEGIN IMMEDIATE`. With concurrent deletes in the same column the position sequence can develop gaps or duplicates. Single-user MVP makes this latent today, but `move_card` already shows the right pattern at `database.py:284–338`; apply it here too.

**M2. `update_card` silently no-ops when both fields are null** — `backend/app/database.py:237–257`, `backend/app/main.py:154–159`
`UpdateCardRequest` allows both `title` and `details` to be `None`. The handler returns `{"ok": True}` but no UPDATE runs. **Fix:** add a Pydantic `model_validator` rejecting requests where both fields are `None`, or short-circuit with a 400 in the handler.

**M3. AI response parser raises on malformed output** — `backend/app/ai.py:94–110`
`json.loads(text)` is called without a fallback. The caller in `main.py:184–188` catches the resulting `JSONDecodeError` as a generic `Exception` and returns 502 "AI request failed." That's correct but loses the distinction between "OpenRouter is down" and "the model returned nonsense." **Fix:** wrap the parse in `try/except json.JSONDecodeError`, log the raw output (truncated), and return a structured `{message: "I had trouble understanding the response — please try again", board_updates: []}` so the user gets a graceful failure path instead of a 502.

**M4. `_apply_board_updates` does no shape validation** — `backend/app/main.py:195–215`
The function indexes into AI-returned dicts with `op["column_id"]`, `op["card_id"]`, `op["title"]`. If the model omits a key (it sometimes will, despite the system prompt), this raises `KeyError`, which becomes an unhandled 500 because the surrounding handler only wraps the `chat_with_board` call in `try/except`. **Fix:** validate each operation with a Pydantic discriminated union, or at minimum wrap the loop in `try/except KeyError` and append a `{success: False, reason: "malformed op"}` entry per failure.

**M5. SQLite has no indexes on hot lookup columns** — `backend/app/database.py:25–57`
No explicit indexes on `sessions.token`, `cards.column_id`, `columns.board_id`, `users.username`. Every authenticated request does a `sessions.token` lookup. SQLite creates implicit indexes for PRIMARY KEY only, not foreign keys. At MVP scale this is invisible; at any growth it becomes a full scan per request. **Fix:** add `CREATE INDEX IF NOT EXISTS` statements in `init_db()` for those four columns.

**M6. Foreign keys without `ON DELETE CASCADE`** — `backend/app/database.py:34–51`
There is no API path to delete a column or board today, but if one is added (or a user is ever deleted), the schema will leak orphaned rows. Either add `ON DELETE CASCADE` to all child FKs, or document that deletes-of-parents are intentionally disallowed.

**M7. `chat_with_board` re-fetches board after applying updates** — `backend/app/main.py:181–192`
`get_board_for_user` is called before AI inference (for the prompt) and again after `_apply_board_updates` (for the response). Two queries on every chat call. With current single-user load this is fine, but it's also one of the easier wins: rebuild the response board from the in-memory `board_data` plus the applied diffs, or accept that the second fetch is the source of truth and skip the first by passing the freshly-fetched board into `chat_with_board`.

**M8. `request_id_middleware` produces an ID nobody uses** — `backend/app/main.py:69–76`
The middleware sets `request.state.request_id` and the response header, but `logger.exception` calls (e.g. `main.py:187`, `main.py:224`) do not include it. This is half-built observability. **Fix:** either propagate the ID into a `LoggerAdapter`/contextvar so log lines are correlated, or remove the middleware until you actually need it. (Also: move the `import uuid` to the top of the file — `main.py:71` is an unusual placement.)

**M9. API client error handling discards the body** — `frontend/src/lib/api.ts:40–46`
```ts
if (!res.ok) throw new Error(`API error: ${res.status}`);
```
The backend returns useful `detail` strings on 4xx (e.g. "Card not found", "Invalid credentials"). The client throws away that detail and the UI surfaces only generic banners. **Fix:** parse the JSON body when present and include it in the error so callers can show the server-provided message — `LoginForm.tsx:30` already tries to read `data.detail` and would benefit immediately.

**M10. `ChatSidebar` uses array index as React key** — `frontend/src/components/ChatSidebar.tsx:111–113`
```tsx
{messages.map((msg, i) => (<div key={i}>...
```
Messages are append-only here so this currently *works*, but it trips React's reconciliation if the list is ever sorted/filtered/deleted, and it disables ESLint's `react/jsx-key` checks. **Fix:** assign `id: crypto.randomUUID()` to each `DisplayMessage` at insertion time and key on that.

**M11. `sendChatMessage` dropping `success: false` results onto the floor** — `frontend/src/components/ChatSidebar.tsx:47–50`
```tsx
if (res.board_updates_applied.length > 0) onBoardUpdated(res.board);
```
The server may return ops with `success: false` (column not found, malformed move) and the user has no idea. The chat shows the AI's optimistic "Created a card titled X" message and the board doesn't update. **Fix:** check `res.board_updates_applied.some(u => u.success === false)` and surface a banner ("AI couldn't apply some changes") or include the failure summary in the assistant message.

**M12. `secure` flag on the session cookie** — `backend/app/main.py:102–108`
Cookie is `httponly=True, samesite="strict"`, no `secure`. For a Docker-on-localhost MVP this is correct (Safari and Chrome both refuse `secure` cookies on `http://localhost`), so this is **not** a current bug — but the moment this is deployed behind any HTTPS proxy the omission becomes a real issue. **Fix when deploying:** make it env-driven, e.g. `secure=os.environ.get("COOKIE_SECURE", "false") == "true"`.

**M13. `print` and `setTimeout(…, 0)` in DnD path obscure intent** — `frontend/src/components/KanbanBoard.tsx:184`
The `setTimeout(…, 0)` exists to let React commit the post-drag state before reading it back. This is fragile (depends on microtask timing) and undocumented. The same effect can be achieved deterministically by computing the destination column and position *during* `handleDragEnd` from the event itself, then calling `moveCardApi` directly without the timeout.

**M14. Backend tests don't cover concurrent or cross-user paths** — `backend/tests/`
- No test for two simultaneous `delete_card`s or two `move_card`s on the same column.
- No test for "user A cannot mutate user B's board." All ownership checks are via `JOIN … WHERE u.username = ?`, but there's only one user in the test DB, so nothing exercises the negative path. Add a second user fixture and a "user2 tries to delete user1's card → 404" assertion. The schema and queries are multi-user-ready per AGENTS.md, so the tests should match.

---

### Low / Nits

**L1. `ai.py:74–91` builds the system prompt with `.format()` after JSON-encoding**
The double-brace escapes (`{{` … `}}`) in `SYSTEM_PROMPT` are easy to break when editing. Use an f-string with the JSON inserted directly, or `string.Template`. Not a bug; readability nit.

**L2. `database.py:8` defaults `DATABASE_PATH` to `/data/kanban.db`**
Local non-Docker runs (`uv run uvicorn …`) fail with `unable to open database file` unless `DATABASE_PATH` is exported. The backend AGENTS.md doesn't mention this. **Fix:** either default to `./kanban.db` and have the Dockerfile set the env, or document the requirement.

**L3. `main.py:107` repeats the `60 * 60 * 24` literal**
`SESSION_TTL` is defined as `60 * 60 * 24` in `database.py:10`; reuse it via `max_age=SESSION_TTL` in the cookie call rather than re-deriving it.

**L4. `ai.py:7` model is selected at import time**
`MODEL = os.environ.get("AI_MODEL", "openai/gpt-oss-120b")` runs once. Tests that change `AI_MODEL` after import won't see the new value. Read it inside `chat_completion`/`chat_with_board` if test-time override matters; otherwise leave alone and document.

**L5. `KanbanBoard.tsx:294–300` hardcodes column colors by index**
`columnColors[i]` indexes a 5-element array. If the user ever has more or fewer than 5 columns, colors silently wrap (or come out `undefined`). Map by column ID once seven columns are possible.

**L6. `ChatSidebar.tsx:75, 158` hardcodes `#8a44a8` hover**
Should be a CSS variable (`--secondary-purple-hover` or similar) per the AGENTS.md "use CSS custom properties for colors" rule.

**L7. `playwright.config.ts` and `playwright.docker.config.ts` are 90% identical**
Two configs, one with `webServer`, one without. Consolidate into one config that conditionally adds `webServer` when `PLAYWRIGHT_BASE_URL` is unset (the dev config already does this — the docker variant is the one to delete).

**L8. `Prompt.txt` at repo root**
Looks like personal scratch from initial scaffolding. It is `.dockerignore`d but not `.gitignore`d, so it's tracked. Either move to `docs/` or delete.

**L9. Dockerfile is single-stage**
Node and the entire `frontend/` tree (including `node_modules`) ship in the runtime image, even though only `frontend/out/` is needed at runtime. **Fix:** multi-stage build — `FROM node:20-slim AS frontend` to produce `out/`, then `COPY --from=frontend /app/out` into the slim Python image. Cuts image size substantially.

**L10. Dockerfile does not copy `uv.lock`**
`uv sync --no-dev` runs without a lockfile, so dependency versions float between builds. **Fix:** `COPY backend/uv.lock backend/uv.lock` next to the `pyproject.toml` copy, and use `uv sync --frozen --no-dev` to force the lock.

**L11. Container runs as root**
No `USER` directive in `Dockerfile`. For a local MVP this is fine; for any deployment, add `RUN useradd -m app && USER app` and ensure `/data` is writable by `app`.

**L12. `vitest.config.ts` enables `globals: true`**
`LoginForm.test.tsx` uses `vi.fn()` without importing `vi`, which only works because of `globals: true`. Either keep globals on (and stop worrying) or turn them off and require explicit imports — pick one. Currently it's a hidden coupling.

**L13. `frontend/src/lib/kanban.ts` — `initialData` and `moveCard`/`createId` are dead code**
After the backend was wired up, `KanbanBoard` no longer references `initialData`, `moveCard`, `createId`, `findColumnId`, or `isColumnId`. The only caller of `moveCard` is `kanban.test.ts`. **Fix:** delete `initialData` and the unused helpers, or move them to a fixtures file under `tests/`. The duplicate seed data at `kanban.ts:18-72` and `database.py:366–375` can drift.

**L14. `Dockerfile:9` apt installs Node 20.19**
This is fine for Next 16 (which requires Node 20+), but pinning the LTS version explicitly via NodeSource or a `node:20-slim` build stage gives reproducibility. See L9.

**L15. `_seed` defaults `ADMIN_USERNAME=user`, `ADMIN_PASSWORD=password`** — `database.py:344–346`
Documented behavior in AGENTS.md, fine for MVP. Add a startup log line ("Seeded admin user: %s", username) so it's obvious the defaults are being used.

---

## 3. Findings dropped after verification

To keep this review honest, here are agent-flagged issues I checked and rejected:

- **"ESLint error in `app/page.tsx`."** No such error exists — `useEffect(() => { checkAuth(); }, [])` is canonical React.
- **"Regex in `api.ts:25` is greedy and may strip prefixes mid-id."** The pattern is `^(col-|card-)` — anchored at start, can only match once.
- **"Stale `activeId` closure in `handleDragEnd` setTimeout."** `activeId` is a `const` captured per call; not stale. (The real issue is the rollback snapshot, see H3.)
- **"`pyproject.toml` should pin `openai<2.0.0`."** No upper bound is conventional for an MVP; `>=1.0.0` is fine until a v2 actually ships and breaks something.
- **"CSRF tokens needed on login/logout."** With `samesite="strict"` on the auth cookie, fetch from a third-party origin won't send it. Strict-samesite is the modern accepted CSRF mitigation for fetch-based clients.
- **"WAL/foreign-keys pragma should run only at init."** SQLite's `foreign_keys` pragma is per-connection by design. The current code is correct.

---

## 4. Recommended priority order

Roughly in the order I'd address these:

1. **C1, C2** — make AI failures fail loudly, cap conversation history. Cheap and high-value.
2. **H1** — add the OpenAI client timeout. One line.
3. **H5** — set `workers: 1` in `playwright.docker.config.ts`. One line, unblocks reliable CI.
4. **H4, M10** — replace `Date.now()`-based IDs with `crypto.randomUUID()` (KanbanBoard temp IDs and ChatSidebar message keys).
5. **H3** — change move-rollback to refetch instead of restoring a snapshot. Eliminates a class of state-race bugs.
6. **M1, M2, M4** — backend correctness: delete-card transaction, update-card both-null guard, AI op validation.
7. **H2** — refactor `KanbanBoard.tsx` into hooks. Bigger lift but the codebase will keep growing here.
8. **M5, M6** — schema indexes and cascade decisions before the schema gets harder to migrate.
9. **L9, L10, L11** — Dockerfile multi-stage + lockfile + non-root user, when deploying becomes real.

Everything else can be paid down opportunistically.
