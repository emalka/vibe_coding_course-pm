import type { BoardData } from "@/lib/kanban";

type ApiCard = {
  id: number;
  title: string;
  details: string;
  position: number;
};

type ApiColumn = {
  id: number;
  title: string;
  position: number;
  cards: ApiCard[];
};

type ApiBoard = {
  id: number;
  name: string;
  columns: ApiColumn[];
};

function apiBoardToLocal(api: ApiBoard): BoardData {
  const cards: BoardData["cards"] = {};
  const columns = api.columns.map((col) => {
    const cardIds = col.cards.map((c) => {
      const id = String(c.id);
      cards[id] = { id, title: c.title, details: c.details };
      return id;
    });
    return { id: String(col.id), title: col.title, cardIds };
  });
  return { columns, cards };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function fetchBoard(): Promise<BoardData> {
  const data = await request<ApiBoard>("/api/board");
  return apiBoardToLocal(data);
}

export async function renameColumn(columnId: string, title: string): Promise<void> {
  await request(`/api/columns/${columnId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

export async function createCard(
  columnId: string,
  title: string,
  details: string
): Promise<{ id: string }> {
  const data = await request<{ id: number }>("/api/cards", json({ column_id: Number(columnId), title, details }));
  return { id: String(data.id) };
}

export async function updateCard(
  cardId: string,
  fields: { title?: string; details?: string }
): Promise<void> {
  await request(`/api/cards/${cardId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
}

export async function deleteCard(cardId: string): Promise<void> {
  await request(`/api/cards/${cardId}`, { method: "DELETE" });
}

export async function moveCardApi(
  cardId: string,
  columnId: string,
  position: number
): Promise<void> {
  await request(`/api/cards/${cardId}/move`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ column_id: Number(columnId), position }),
  });
}

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResponse = {
  message: string;
  board_updates_applied: unknown[];
};

export async function sendChatMessage(
  message: string,
  conversationHistory: ChatMessage[]
): Promise<ChatResponse> {
  return request<ChatResponse>("/api/ai/chat", json({ message, conversation_history: conversationHistory }));
}
