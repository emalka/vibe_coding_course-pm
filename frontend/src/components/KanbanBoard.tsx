"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  pointerWithin,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { ChatSidebar } from "@/components/ChatSidebar";
import type { BoardData } from "@/lib/kanban";
import {
  fetchBoard,
  renameColumn as apiRenameColumn,
  createCard as apiCreateCard,
  deleteCard as apiDeleteCard,
  moveCardApi,
} from "@/lib/api";

type KanbanBoardProps = {
  onLogout?: () => void;
};

export const KanbanBoard = ({ onLogout }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boardBeforeDrag = useRef<BoardData | null>(null);

  useEffect(() => {
    fetchBoard()
      .then(setBoard)
      .catch(() => setError("Failed to load board"))
      .finally(() => setLoading(false));
  }, []);

  const refreshBoard = useCallback(() => {
    fetchBoard().then(setBoard).catch(() => {});
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => board?.cards ?? {}, [board?.cards]);

  const columnIds = useMemo(
    () => new Set(board?.columns.map((c) => c.id) ?? []),
    [board?.columns]
  );

  const findColumnOfCard = useCallback(
    (cardId: string): string | undefined => {
      if (!board) return undefined;
      if (columnIds.has(cardId)) return cardId;
      return board.columns.find((c) => c.cardIds.includes(cardId))?.id;
    },
    [board, columnIds]
  );

  // Custom collision detection: use pointerWithin to find which column the
  // pointer is in, then closestCenter for card-level precision within it.
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      const pointerCollisions = pointerWithin(args);
      const colHit = pointerCollisions.find((c) => columnIds.has(c.id as string));

      if (colHit) {
        // Find the closest card within the target column
        const centerCollisions = closestCenter(args);
        const cardInCol = centerCollisions.find((c) => {
          const id = c.id as string;
          if (columnIds.has(id)) return false;
          const col = board?.columns.find((col) => col.id === colHit.id);
          return col?.cardIds.includes(id);
        });
        return [cardInCol ?? colHit];
      }

      return [];
    },
    [columnIds, board]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
    boardBeforeDrag.current = board;
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !board) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    const activeCol = findColumnOfCard(activeId);
    const overCol = findColumnOfCard(overId);

    if (!activeCol || !overCol || activeCol === overCol) return;

    // Card is being dragged over a different column — move it there in state
    setBoard((prev) => {
      if (!prev) return prev;
      const srcCol = prev.columns.find((c) => c.id === activeCol)!;
      const dstCol = prev.columns.find((c) => c.id === overCol)!;

      const srcCards = srcCol.cardIds.filter((id) => id !== activeId);
      const dstCards = [...dstCol.cardIds];

      // Insert at the position of the hovered card, or at the end if hovering the column itself
      const overIndex = columnIds.has(overId)
        ? dstCards.length
        : dstCards.indexOf(overId);
      const insertAt = overIndex === -1 ? dstCards.length : overIndex;
      dstCards.splice(insertAt, 0, activeId);

      return {
        ...prev,
        columns: prev.columns.map((col) => {
          if (col.id === activeCol) return { ...col, cardIds: srcCards };
          if (col.id === overCol) return { ...col, cardIds: dstCards };
          return col;
        }),
      };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || !board) {
      // Cancelled — revert
      if (boardBeforeDrag.current) setBoard(boardBeforeDrag.current);
      boardBeforeDrag.current = null;
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeCol = findColumnOfCard(activeId);
    const overCol = findColumnOfCard(overId);

    if (activeCol && overCol && activeCol === overCol) {
      // Within same column — reorder
      const col = board.columns.find((c) => c.id === activeCol)!;
      const oldIndex = col.cardIds.indexOf(activeId);
      const newIndex = columnIds.has(overId)
        ? col.cardIds.length - 1
        : col.cardIds.indexOf(overId);

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const newCardIds = arrayMove(col.cardIds, oldIndex, newIndex);
        setBoard((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            columns: prev.columns.map((c) =>
              c.id === activeCol ? { ...c, cardIds: newCardIds } : c
            ),
          };
        });
      }
    }

    // Persist to backend: find where the card ended up
    // Use a microtask so the state update above is applied first
    setTimeout(() => {
      setBoard((current) => {
        if (!current) return current;
        const targetCol = current.columns.find((c) => c.cardIds.includes(activeId));
        if (targetCol) {
          const position = targetCol.cardIds.indexOf(activeId);
          moveCardApi(activeId, targetCol.id, position).catch(() => {
            if (boardBeforeDrag.current) setBoard(boardBeforeDrag.current);
          });
        }
        boardBeforeDrag.current = null;
        return current;
      });
    }, 0);
  };

  const handleRenameColumn = useCallback((columnId: string, title: string) => {
    setBoard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        columns: prev.columns.map((column) =>
          column.id === columnId ? { ...column, title } : column
        ),
      };
    });

    // Debounce the API call
    if (renameTimer.current) clearTimeout(renameTimer.current);
    renameTimer.current = setTimeout(() => {
      apiRenameColumn(columnId, title).catch(() => {});
    }, 500);
  }, []);

  const handleAddCard = async (columnId: string, title: string, details: string) => {
    if (!board) return;
    const prev = board;

    // Optimistic: add with temp id
    const tempId = `temp-${Date.now()}`;
    setBoard({
      ...prev,
      cards: { ...prev.cards, [tempId]: { id: tempId, title, details: details || "" } },
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, tempId] }
          : column
      ),
    });

    try {
      const { id } = await apiCreateCard(columnId, title, details);
      // Replace temp id with real id
      setBoard((current) => {
        if (!current) return current;
        const { [tempId]: tempCard, ...restCards } = current.cards;
        return {
          ...current,
          cards: { ...restCards, [id]: { id, title, details: details || "" } },
          columns: current.columns.map((column) => ({
            ...column,
            cardIds: column.cardIds.map((cid) => (cid === tempId ? id : cid)),
          })),
        };
      });
    } catch {
      setBoard(prev);
    }
  };

  const handleDeleteCard = async (columnId: string, cardId: string) => {
    if (!board) return;
    const prev = board;

    setBoard({
      ...prev,
      cards: Object.fromEntries(
        Object.entries(prev.cards).filter(([id]) => id !== cardId)
      ),
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: column.cardIds.filter((id) => id !== cardId) }
          : column
      ),
    });

    try {
      await apiDeleteCard(cardId);
    } catch {
      setBoard(prev);
    }
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  const columnColors = [
    "var(--col-backlog)",
    "var(--col-discovery)",
    "var(--col-progress)",
    "var(--col-review)",
    "var(--col-done)",
  ];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-[var(--gray-text)]">Loading board...</p>
      </div>
    );
  }

  if (error || !board) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-red-500">{error ?? "Something went wrong"}</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[500px] w-[500px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.15)_0%,_rgba(32,157,215,0.03)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[600px] w-[600px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.10)_0%,_rgba(117,57,145,0.03)_55%,_transparent_75%)]" />

      <ChatSidebar open={chatOpen} onToggle={() => setChatOpen((p) => !p)} onBoardUpdated={refreshBoard} />

      <main className="relative mx-auto flex min-h-screen max-w-[1600px] flex-col gap-8 px-6 pb-12 pt-10">
        <header className="flex flex-col gap-5 rounded-2xl border border-[var(--stroke)] bg-white/70 px-8 py-6 shadow-[var(--shadow)] backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-[var(--gray-text)]">
                Project Board
              </p>
              <h1 className="mt-2 font-display text-3xl font-bold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex flex-wrap items-center gap-2">
                {board.columns.map((column, i) => (
                  <div
                    key={column.id}
                    className="flex items-center gap-2 rounded-lg border border-[var(--stroke)] bg-[var(--surface)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--navy-dark)]"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: columnColors[i] }}
                    />
                    {column.title}
                    <span className="ml-1 text-[var(--gray-text)]">{column.cardIds.length}</span>
                  </div>
                ))}
              </div>
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="rounded-lg border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]"
                >
                  Sign out
                </button>
              )}
            </div>
          </div>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <section className="grid auto-cols-[minmax(260px,1fr)] grid-flow-col gap-5 overflow-x-auto pb-4 lg:grid-cols-5 lg:grid-flow-row lg:overflow-x-visible">
            {board.columns.map((column, i) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                accentColor={columnColors[i]}
                onRename={handleRenameColumn}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px] rotate-[2deg] scale-105">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
  );
};
