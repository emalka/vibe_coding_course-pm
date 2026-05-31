# Frontend Code Review

Scope: `frontend/src/{app, components, lib}` (production code; test files not reviewed in depth).
Severity legend: **HIGH** (correctness/UX bug users will hit), **MED** (latent bug or design risk), **LOW** (polish, dead code).

---

## HIGH — Correctness

### 1. Column rename: optimistic update is never reverted on API failure
`lib/hooks/useBoard.ts:50-67` — the local title is updated synchronously, then the API call is debounced 500 ms. On failure, `setOpError(...)` runs but the title in state is **not** rolled back. Result: UI shows "Updated Title", DB still has "Original Title", next refresh silently snaps back. Capture the prior title before the optimistic update and restore it inside the `.catch`.

### 2. Column rename: pending edit is dropped on unmount
`lib/hooks/useBoard.ts:31-39, 61-67` — the cleanup function only `clearTimeout`s the pending rename; it never flushes the call. User types in a column title, clicks "Sign out" within 500 ms → rename is lost. Either flush on unmount (await the API call) or shorten the debounce to ~150 ms so the window is small.

### 3. `addCard` / `deleteCard` use a closure snapshot instead of functional `setState`
`lib/hooks/useBoard.ts:69-128` — both helpers do `const prev = board;` then `setBoard({ ...prev, ... })`. If the user fires two operations back-to-back (e.g. add card A, then add card B before A's `setBoard` flushes), the second call's `prev` is stale and **erases the first optimistic card**. Same problem for the rollback path: a `.catch` that calls `setBoard(prev)` will wipe any unrelated changes the user made in the meantime. Use the functional form everywhere:
```ts
setBoard((cur) => cur ? { ...cur, ... } : cur);
```
…and for rollback, track only the affected slice (or refetch).

### 4. `COLUMN_COLORS` array indexed by column position, fixed length 5
`components/KanbanBoard.tsx:11-17, 86-99, 130-141` — both the header pills and column accents do `COLUMN_COLORS[i]`. The board model supports any number of columns; once the AI (or a future feature) creates a 6th, `i = 5` returns `undefined` and that column has no accent color. Either cycle (`COLUMN_COLORS[i % COLUMN_COLORS.length]`) or derive a color from the column id.

### 5. `request<T>` discards the server's error detail
`lib/api.ts:40-46` — throws `new Error(`API error: ${res.status}`)` and never parses the body. FastAPI returns `{ "detail": "..." }` with useful context (e.g. "Column not found"). Users only see "Failed to create card. Please try again.", which is wrong when the underlying problem is, say, an expired session (401) or a stale column id (404). Parse the body and surface `detail` when present; treat 401 specifically by sending the user back to the login screen.

---

## MED — Correctness / UX

### 6. `NewCardForm` resets before the API result is known
`components/NewCardForm.tsx:18-26` — on submit, the form clears and closes immediately. If the API call fails, the user sees an error toast but their typed title/details are gone. Either keep the form open until `onAdd` resolves successfully (requires returning the promise — `onAdd` is already `Promise<void>` in `useBoard`), or stash the last-failed value so the user can retry.

### 7. Drag-cancel relies on a network refresh to undo optimistic state
`lib/hooks/useBoardDnd.ts:120-128` — if the user releases outside any droppable, the handler calls `refresh()`. But `handleDragOver` already mutated the local board (potentially across columns). For the duration of the network round-trip the board shows a wrong layout. Snapshot the pre-drag column state on `handleDragStart` and restore from memory on cancel.

### 8. Cross-column drop persistence depends on React flush ordering
`lib/hooks/useBoardDnd.ts:120-163` — `handleDragOver` updates local state cross-column; `handleDragEnd` then re-derives `activeCol` from the (post-update) `board` and calls `moveCardApi`. This works because `handleDragOver` and `handleDragEnd` happen in separate event ticks, so the rerender lands between them. It's fragile — a future change that makes `handleDragOver` purely visual (e.g. with `useDeferredValue`) would silently break persistence. Worth a comment, or, cleaner, derive the final destination from the `over` payload directly instead of re-querying state.

### 9. `page.tsx`: logout fetch is fire-and-forget
`app/page.tsx:25-28` — `await fetch("/api/logout", ...)` has no try/catch and the result isn't checked. If the network blips, `setAuth("logged-out")` still runs and the local UI says you're signed out while the cookie is still valid. Low risk in practice (the cookie's `samesite=strict` and 24-hour TTL limit exposure), but a single `try/catch` with a user-visible error would be cheap.

### 10. Chat: no cancellation of in-flight AI request
`components/ChatSidebar.tsx:36-59` — input is disabled while `loading`, but the user cannot abort a slow request. If the model hangs near the 30 s server timeout, the sidebar is unusable. Pass an `AbortController` into `fetch` (in `lib/api.ts`) and expose a cancel button when `loading`.

### 11. Chat: every message scrolls to bottom even after the user scrolled up
`components/ChatSidebar.tsx:25-27` — `scrollIntoView({ behavior: "smooth" })` runs unconditionally on every messages change. If the user scrolls up to re-read context, the next message yanks them back. Track whether the user is near the bottom (~50 px) and only auto-scroll then.

---

## LOW — Dead code & hygiene

### 12. `src/lib/kanban.ts`: ~140 lines of dead code
Confirmed via grep — outside of `kanban.ts` itself (and possibly its `*.test.ts`), none of these are imported:
- `initialData` (lines 18-72) — the demo board, replaced by the API fetch.
- `moveCard` (lines 84-162) — superseded by the in-hook logic in `useBoardDnd.ts`.
- `createId` (lines 164-168) — `useBoard.addCard` uses `crypto.randomUUID()` directly.
- `findColumnId` / `isColumnId` (lines 74-82) — only used by the dead `moveCard`.

Only the types (`Card`, `Column`, `BoardData`) are still needed. Delete the rest (and update the test file if it exercises them) to bring the file under 20 lines.

### 13. `lib/api.ts:updateCard` is exported but never used
`lib/api.ts:76-85` — grep confirms zero call sites. The UI has no edit-card affordance. Either remove it or wire up the missing UI (card details aren't editable today, which is a noticeable functional gap given the schema supports it).

### 14. `addCard` / `deleteCard` are not memoized
`lib/hooks/useBoard.ts:69-128` — `renameColumn` / `refresh` / `applyAiUpdate` are wrapped in `useCallback`, but `addCard` and `deleteCard` are not. They're passed down to every `KanbanColumn`, which means every render of `KanbanBoard` re-creates them, defeating any future `React.memo`. Wrap in `useCallback`.

### 15. Auth check on every page load produces a 401 in the console
`app/page.tsx:12-23` — `GET /api/me` on first visit (or after logout) returns 401 and the browser logs it. Cosmetic, but distracting in DevTools. Consider treating 401 as the expected "logged out" path without involving an error response (e.g. `/api/me` returns `{ "username": null }` with 200).

### 16. `apiBoardToLocal` drops `position` from the local model
`lib/api.ts:27-38` — backend sends `position` for cards; the local model uses array order via `cardIds[]`. Today the backend pre-sorts (`ORDER BY col.position, ca.position`) so order is correct, but `apiBoardToLocal` makes no assertion of that. If anyone ever changes the backend query, ordering silently breaks. One-line fix: `col.cards.slice().sort((a, b) => a.position - b.position)` before mapping.

### 17. `KanbanCard.tsx`: drag listeners and delete button share the same root
`components/KanbanCard.tsx:31-53` — the article has `{...listeners}`, and the inner button has `onClick`. Works today thanks to the 6 px `PointerSensor` activation threshold, but a casual reader (or future contributor adding touch support) will assume bug. A two-line `onPointerDown={(e) => e.stopPropagation()}` on the button makes intent explicit.

### 18. `LoginForm.tsx`: `data.ok` check pattern is brittle
`components/LoginForm.tsx:26-31` — relies on FastAPI returning `{ ok: true }` on success and `{ detail: "..." }` on failure. If the backend's success shape ever changes (e.g. returns just `{ username }`), the login screen silently shows "Invalid credentials". Branch on `res.ok` (the HTTP status) instead of `data.ok`.

### 19. `request<T>` doesn't set `credentials`
`lib/api.ts:40-46` — relies on the default `credentials: "same-origin"`, which is correct given the static export is served from the same FastAPI app. If anyone ever runs the dev server (port 3000) against a remote backend, cookies won't be sent and every call 401s. Worth a comment so the assumption is explicit, or set `credentials: "same-origin"` explicitly.

### 20. `KanbanColumn`'s `useDroppable` lights up the whole column on hover
`components/KanbanColumn.tsx:25, 30-35` — `isOver` is true whenever the pointer is within the column droppable. Because the cards are *also* droppables (via `useSortable`), pointing at a card highlights the whole column. Minor visual noise. Either ignore `isOver` when a card is the hit-test winner, or only show the column highlight when the column itself (not a child card) is the over target.

---

## Tests not covered above
The Playwright specs and Vitest component tests weren't reviewed. The areas most worth a manual review pass given the issues above: cross-column DnD persistence (issue 8), the rename-debounce edge cases (issues 1 & 2), and the COLUMN_COLORS fixed-length assumption (issue 4 — no test will catch this until a 6th column appears).
