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

export function useBoard(): UseBoard {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opError, setOpError] = useState<string | null>(null);
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchBoard()
      .then(setBoard)
      .catch(() => setError("Failed to load board"))
      .finally(() => setLoading(false));
    return () => {
      if (renameTimer.current) clearTimeout(renameTimer.current);
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const fresh = await fetchBoard();
      setBoard(fresh);
    } catch {
      setOpError("Failed to refresh board.");
    }
  }, []);

  const renameColumn = useCallback((columnId: string, title: string) => {
    setBoard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        columns: prev.columns.map((column) =>
          column.id === columnId ? { ...column, title } : column
        ),
      };
    });

    if (renameTimer.current) clearTimeout(renameTimer.current);
    renameTimer.current = setTimeout(() => {
      apiRenameColumn(columnId, title).catch(() => {
        setOpError("Failed to rename column. Please try again.");
      });
    }, 500);
  }, []);

  const addCard = async (columnId: string, title: string, details: string) => {
    if (!board) return;
    const prev = board;
    const tempId = `temp-${crypto.randomUUID()}`;

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
      setBoard((current) => {
        if (!current) return current;
        const restCards = Object.fromEntries(
          Object.entries(current.cards).filter(([cid]) => cid !== tempId)
        );
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
      setOpError("Failed to create card. Please try again.");
    }
  };

  const deleteCard = async (columnId: string, cardId: string) => {
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
      setOpError("Failed to delete card. Please try again.");
    }
  };

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
