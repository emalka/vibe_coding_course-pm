import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  accentColor: string;
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
};

export const KanbanColumn = ({
  column,
  cards,
  accentColor,
  onRename,
  onAddCard,
  onDeleteCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[480px] flex-col rounded-2xl border bg-[var(--surface-strong)] p-4 transition-all duration-200",
        isOver
          ? "border-[var(--primary-blue)] bg-blue-50/30 shadow-[var(--shadow-hover)]"
          : "border-[var(--stroke)] shadow-[var(--shadow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="mb-4">
        <div className="flex items-center gap-3">
          <div
            className="h-1.5 w-8 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
          <span className="rounded-md bg-[var(--surface)] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[var(--gray-text)]">
            {cards.length}
          </span>
        </div>
        <input
          value={column.title}
          onChange={(event) => onRename(column.id, event.target.value)}
          className="mt-2 w-full bg-transparent font-display text-base font-bold text-[var(--navy-dark)] outline-none placeholder:text-[var(--gray-text)] focus:underline focus:decoration-[var(--primary-blue)] focus:decoration-2 focus:underline-offset-4"
          aria-label="Column title"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2.5">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--stroke)] px-3 py-8 text-center">
            <p className="text-xs text-[var(--gray-text)]">
              Drop a card here
            </p>
          </div>
        )}
      </div>
      <NewCardForm
        onAdd={(title, details) => onAddCard(column.id, title, details)}
      />
    </section>
  );
};
