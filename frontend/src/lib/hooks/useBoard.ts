import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardData } from "@/lib/kanban";
import {
  fetchBoard,
  renameColumn as apiRenameColumn,
  createCard as apiCreateCard,
  deleteCard as apiDeleteCard,
} from "@/lib/api";

export type UseBoard = {
  board: BoardData | null;
  setBoard: React.Dispatch<React.SetStateAction<BoardData | null>>;
  loading: boolean;
  error: string | null;
  opError: string | null;
  setOpError: (e: string | null) => void;
  renameColumn: (columnId: string, title: string) => void;
  addCard: (columnId: string, title: string, details: string) => Promise<void>;
  deleteCard: (columnId: string, cardId: string) => Promise<void>;
  refresh: () => Promise<void>;
  applyAiUpdate: (updated?: BoardData) => void;
};

const RENAME_DEBOUNCE_MS = 500;

export function useBoard(): UseBoard {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opError, setOpError] = useState<string | null>(null);
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRename = useRef<{ columnId: string; title: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const fresh = await fetchBoard();
      setBoard(fresh);
    } catch {
      setOpError("Failed to refresh board.");
    }
  }, []);

  useEffect(() => {
    fetchBoard()
      .then(setBoard)
      .catch(() => setError("Failed to load board"))
      .finally(() => setLoading(false));

    return () => {
      // Flush any pending rename so the user's last keystroke isn't lost on unmount.
      if (renameTimer.current) clearTimeout(renameTimer.current);
      const pending = pendingRename.current;
      if (pending) {
        pendingRename.current = null;
        const apiId = pending.columnId.replace(/^col-/, "");
        // keepalive lets the request survive even if the tab is closing.
        fetch(`/api/columns/${apiId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: pending.title }),
          keepalive: true,
        }).catch(() => {
          // Best-effort flush; if it fails the next mount will refetch.
        });
      }
    };
  }, []);

  const renameColumn = useCallback(
    (columnId: string, title: string) => {
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          columns: prev.columns.map((column) =>
            column.id === columnId ? { ...column, title } : column
          ),
        };
      });

      pendingRename.current = { columnId, title };
      if (renameTimer.current) clearTimeout(renameTimer.current);
      renameTimer.current = setTimeout(() => {
        const pending = pendingRename.current;
        pendingRename.current = null;
        if (!pending) return;
        apiRenameColumn(pending.columnId, pending.title).catch(() => {
          setOpError("Failed to rename column. Reverting to the saved title.");
          // Refetch so the UI matches what's actually persisted.
          refresh();
        });
      }, RENAME_DEBOUNCE_MS);
    },
    [refresh]
  );

  const addCard = useCallback(
    async (columnId: string, title: string, details: string) => {
      const tempId = `temp-${crypto.randomUUID()}`;

      setBoard((current) => {
        if (!current) return current;
        return {
          ...current,
          cards: {
            ...current.cards,
            [tempId]: { id: tempId, title, details: details || "" },
          },
          columns: current.columns.map((column) =>
            column.id === columnId
              ? { ...column, cardIds: [...column.cardIds, tempId] }
              : column
          ),
        };
      });

      try {
        const { id } = await apiCreateCard(columnId, title, details);
        setBoard((current) => {
          if (!current) return current;
          const nextCards = { ...current.cards, [id]: { id, title, details: details || "" } };
          delete nextCards[tempId];
          return {
            ...current,
            cards: nextCards,
            columns: current.columns.map((column) => ({
              ...column,
              cardIds: column.cardIds.map((cid) => (cid === tempId ? id : cid)),
            })),
          };
        });
      } catch (err) {
        // Roll back just the temp card, leaving any unrelated optimistic state alone.
        setBoard((current) => {
          if (!current) return current;
          const nextCards = { ...current.cards };
          delete nextCards[tempId];
          return {
            ...current,
            cards: nextCards,
            columns: current.columns.map((column) => ({
              ...column,
              cardIds: column.cardIds.filter((cid) => cid !== tempId),
            })),
          };
        });
        setOpError(
          err instanceof Error ? err.message : "Failed to create card. Please try again."
        );
      }
    },
    []
  );

  const deleteCard = useCallback(
    async (columnId: string, cardId: string) => {
      // Snapshot the card we're about to remove so we can restore on failure.
      let removed: { card: BoardData["cards"][string]; index: number } | null = null;
      setBoard((current) => {
        if (!current) return current;
        const col = current.columns.find((c) => c.id === columnId);
        const card = current.cards[cardId];
        if (col && card) {
          removed = { card, index: col.cardIds.indexOf(cardId) };
        }
        const nextCards = { ...current.cards };
        delete nextCards[cardId];
        return {
          ...current,
          cards: nextCards,
          columns: current.columns.map((column) =>
            column.id === columnId
              ? { ...column, cardIds: column.cardIds.filter((id) => id !== cardId) }
              : column
          ),
        };
      });

      try {
        await apiDeleteCard(cardId);
      } catch (err) {
        // Restore the removed card at its original index.
        setBoard((current) => {
          if (!current || !removed) return current;
          const { card, index } = removed;
          return {
            ...current,
            cards: { ...current.cards, [cardId]: card },
            columns: current.columns.map((column) => {
              if (column.id !== columnId) return column;
              const next = [...column.cardIds];
              next.splice(index >= 0 ? index : next.length, 0, cardId);
              return { ...column, cardIds: next };
            }),
          };
        });
        setOpError(
          err instanceof Error ? err.message : "Failed to delete card. Please try again."
        );
      }
    },
    []
  );

  const applyAiUpdate = useCallback(
    (updatedBoard?: BoardData) => {
      if (updatedBoard) {
        setBoard(updatedBoard);
      } else {
        refresh();
      }
    },
    [refresh]
  );

  return {
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
  };
}
