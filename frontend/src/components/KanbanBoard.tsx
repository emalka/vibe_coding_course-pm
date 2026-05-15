"use client";

import { useState } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { ChatSidebar } from "@/components/ChatSidebar";
import { useBoard } from "@/lib/hooks/useBoard";
import { useBoardDnd } from "@/lib/hooks/useBoardDnd";

const COLUMN_COLORS = [
  "var(--col-backlog)",
  "var(--col-discovery)",
  "var(--col-progress)",
  "var(--col-review)",
  "var(--col-done)",
];

type KanbanBoardProps = {
  onLogout?: () => void;
};

export const KanbanBoard = ({ onLogout }: KanbanBoardProps) => {
  const {
    board,
    setBoard,
    loading,
    error,
    opError,
    setOpError,
    renameColumn,
    addCard,
    deleteCard,
    refresh,
    applyAiUpdate,
  } = useBoard();

  const {
    activeCardId,
    sensors,
    collisionDetection,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  } = useBoardDnd({ board, setBoard, refresh, setOpError });

  const [chatOpen, setChatOpen] = useState(false);
  const activeCard = activeCardId && board ? board.cards[activeCardId] : null;

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

      <ChatSidebar open={chatOpen} onToggle={() => setChatOpen((p) => !p)} onBoardUpdated={applyAiUpdate} />

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
                      style={{ backgroundColor: COLUMN_COLORS[i] }}
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
          {opError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-600 cursor-pointer"
              onClick={() => setOpError(null)}
            >
              {opError} <span className="underline">Dismiss</span>
            </div>
          )}
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
                accentColor={COLUMN_COLORS[i]}
                onRename={renameColumn}
                onAddCard={addCard}
                onDeleteCard={deleteCard}
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
