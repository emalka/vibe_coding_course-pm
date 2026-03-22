# Frontend - Kanban Studio

## Overview

A Next.js 16 Kanban board app using React 19, Tailwind CSS 4, and @dnd-kit for drag-and-drop. Currently frontend-only with local state; will be connected to a FastAPI backend.

## Architecture

### Data Model (src/lib/kanban.ts)

Normalized structure:
- `Card`: { id, title, details }
- `Column`: { id, title, cardIds[] }
- `BoardData`: { columns[], cards{} } where cards is a Record keyed by card ID

Key functions: `moveCard()`, `createId(prefix)`, `findColumnId()`, `isColumnId()`

### Component Hierarchy

```
page.tsx (client component)
  KanbanBoard (container - owns all state)
    KanbanColumn (droppable zone, editable title)
      KanbanCard (sortable/draggable item)
      NewCardForm (toggle-based add form)
    KanbanCardPreview (drag overlay)
```

All state lives in `KanbanBoard` via `useState`. Props flow down; callbacks flow up.

### Drag and Drop

Uses `@dnd-kit` with:
- `DndContext` at board level
- `SortableContext` per column (verticalListSortingStrategy)
- `useDroppable` on columns, `useSortable` on cards
- `DragOverlay` with `KanbanCardPreview` for drag feedback
- PointerSensor with 6px activation distance

### Styling

- Tailwind CSS 4 with `@tailwindcss/postcss`
- CSS custom properties in globals.css for the color scheme:
  - `--accent-yellow`: #ecad0a
  - `--primary-blue`: #209dd7
  - `--secondary-purple`: #753991
  - `--navy-dark`: #032147
  - `--gray-text`: #888888
  - `--surface`: #f7f8fb, `--surface-strong`: #fff
  - `--stroke`, `--shadow` for borders/elevation
- Fonts: Space Grotesk (display), Manrope (body) via next/font/google

### Testing

Three layers:
- **Unit tests** (vitest): src/lib/kanban.test.ts - tests moveCard logic
- **Component tests** (vitest + testing-library): src/components/KanbanBoard.test.tsx - render, rename, add/delete
- **E2E tests** (playwright): tests/kanban.spec.ts - full user flows including drag-and-drop

Test config: jsdom environment, @testing-library/jest-dom matchers, globals enabled.

## Coding Conventions

### General

- TypeScript strict mode. No `any` types.
- Use the `@/*` path alias (maps to `./src/*`).
- Keep components small and focused. One component per file.
- No default exports except for pages (Next.js requirement).

### Components

- Functional components only with arrow functions.
- Props defined as inline types or named `{ComponentName}Props`.
- State management: `useState` / `useReducer` in the top-level container; pass data and callbacks via props.
- Use `clsx` for conditional class composition.
- No external state libraries (no Redux, Zustand, etc.) unless explicitly decided.

### Styling

- Tailwind utility classes for layout and spacing.
- Use CSS custom properties (from globals.css) for colors: reference via `var(--navy-dark)` etc.
- No CSS modules, no styled-components, no inline style objects unless unavoidable.
- Follow the project color scheme strictly.

### Data & Logic

- Business logic goes in `src/lib/`, not in components.
- Keep the normalized data model (cards dict + column cardIds).
- ID generation: `createId(prefix)` from kanban.ts.

### Testing

- Unit tests next to the file they test: `foo.test.ts` beside `foo.ts`.
- Component tests next to the component: `Foo.test.tsx` beside `Foo.tsx`.
- E2E tests in `tests/`.
- Follow AAA pattern (Arrange, Act, Assert).
- Test behavior, not implementation details.

### Files & Naming

- Components: PascalCase (`KanbanCard.tsx`).
- Lib/util files: camelCase (`kanban.ts`).
- Test files: same name with `.test.ts` / `.test.tsx` suffix.
