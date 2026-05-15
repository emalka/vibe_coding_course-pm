import { useCallback, useMemo, useState } from "react";
import {
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { BoardData } from "@/lib/kanban";
import { moveCardApi } from "@/lib/api";

type UseBoardDndConfig = {
  board: BoardData | null;
  setBoard: React.Dispatch<React.SetStateAction<BoardData | null>>;
  refresh: () => Promise<void>;
  setOpError: (e: string | null) => void;
};

export type UseBoardDnd = {
  activeCardId: string | null;
  sensors: ReturnType<typeof useSensors>;
  collisionDetection: CollisionDetection;
  handleDragStart: (event: DragStartEvent) => void;
  handleDragOver: (event: DragOverEvent) => void;
  handleDragEnd: (event: DragEndEvent) => void;
};

export function useBoardDnd({
  board,
  setBoard,
  refresh,
  setOpError,
}: UseBoardDndConfig): UseBoardDnd {
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

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

  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      const pointerCollisions = pointerWithin(args);
      const colHit = pointerCollisions.find((c) => columnIds.has(c.id as string));

      if (colHit) {
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
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !board) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    const activeCol = findColumnOfCard(activeId);
    const overCol = findColumnOfCard(overId);

    if (!activeCol || !overCol || activeCol === overCol) return;

    setBoard((prev) => {
      if (!prev) return prev;
      const srcCol = prev.columns.find((c) => c.id === activeCol)!;
      const dstCol = prev.columns.find((c) => c.id === overCol)!;

      const srcCards = srcCol.cardIds.filter((id) => id !== activeId);
      const dstCards = [...dstCol.cardIds];

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

    if (!over) {
      // Cancelled — handleDragOver may have shuffled state optimistically; resync from server
      refresh();
      return;
    }
    if (!board) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeCol = findColumnOfCard(activeId);
    const overCol = findColumnOfCard(overId);
    if (!activeCol || !overCol || activeCol !== overCol) return;

    const col = board.columns.find((c) => c.id === activeCol)!;
    const oldIndex = col.cardIds.indexOf(activeId);
    const newIndex = columnIds.has(overId)
      ? col.cardIds.length - 1
      : col.cardIds.indexOf(overId);

    let finalCardIds = col.cardIds;
    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      finalCardIds = arrayMove(col.cardIds, oldIndex, newIndex);
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          columns: prev.columns.map((c) =>
            c.id === activeCol ? { ...c, cardIds: finalCardIds } : c
          ),
        };
      });
    }

    const finalPosition = finalCardIds.indexOf(activeId);
    moveCardApi(activeId, activeCol, finalPosition).catch(() => {
      setOpError("Failed to move card. Please try again.");
      refresh();
    });
  };

  return {
    activeCardId,
    sensors,
    collisionDetection,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  };
}
