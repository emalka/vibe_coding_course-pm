

## Technology Stack

- Stack: Next.js 16, React 19, TypeScript (strict), Tailwind CSS 4, `@dnd-kit` (core + sortable)
- Testing: Testing Library (frontend unit/component), Playwright (E2E)

## Project Structure

- Source Root - `/frontend/src`
- `app/page.tsx` — root: `LoginForm` or `KanbanBoard` based on auth
- `lib/api.ts` — all HTTP to `/api/*`; transforms API ↔ local state
- `lib/kanban.ts` — board types + pure helpers (`moveCard`, `createId`, `findColumnId`, `isColumnId`)
- `components/KanbanBoard.tsx` — owns board state, passes down
- `components/ChatSidebar.tsx` — AI chat; sends history to `/api/ai/chat`, applies returned board updates

## Data Model

Kanban Components: `KanbanBoard → KanbanColumn → (KanbanCard | NewCardForm)` + `KanbanCardPreview` drag overlay.

Model (normalized): `Card {id,title,details}`, `Column {id,title,cardIds[]}`, `BoardData {columns[], cards{}}`.

DnD: `DndContext` at board, `SortableContext` per column (vertical), `useDroppable` on columns, `useSortable` on cards, `PointerSensor` with 6px activation.

## Frontend Commands

The Frontend code is in `/frontend` The commands relevant to the Fronend project are:

```bash
npm run dev              # http://localhost:3000
npm run build            # static export to frontend/out/
npm run lint
npm run test             # unit tests
npm run test:unit:watch
npm run test:e2e         # needs dev server
npm run test:all
npx vitest run src/components/KanbanBoard.test.tsx   # single file
```

## Frontend Color Scheme

CSS custom properties in `frontend/src/app/globals.css`:

- `--accent-yellow: #ecad0a` — accent lines, highlights
- `--primary-blue: #209dd7` — links, key sections
- `--secondary-purple: #753991` — submit buttons, important actions
- `--navy-dark: #032147` — main headings
- `--gray-text: #888888` — supporting text, labels
- `--surface: #f7f8fb`, `--surface-strong: #fff`, plus `--stroke`, `--shadow`

Fonts: Space Grotesk (display) + Manrope (body) via `next/font/google`.

## Coding Conventions

- TypeScript strict, no `any`. `@/*` path alias → `./src/*`.
- Functional components, arrow functions, one per file. No default exports except pages.
- Props as inline types or `{ComponentName}Props`.
- State via `useState`/`useReducer` in the top container; data/callbacks via props. No external state libs.
- `clsx` for conditional classes. Tailwind utilities + CSS custom properties (`var(--navy-dark)` etc.). No CSS modules / styled-components / inline styles.
- Business logic in `src/lib/`, not components. Keep the normalized data model. IDs via `createId(prefix)`.