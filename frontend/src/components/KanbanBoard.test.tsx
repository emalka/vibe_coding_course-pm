import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData } from "@/lib/kanban";
import { vi } from "vitest";

vi.mock("@/lib/api", () => ({
  fetchBoard: vi.fn(() => Promise.resolve(initialData)),
  renameColumn: vi.fn(() => Promise.resolve()),
  createCard: vi.fn(() => Promise.resolve({ id: "99" })),
  deleteCard: vi.fn(() => Promise.resolve()),
  moveCardApi: vi.fn(() => Promise.resolve()),
  sendChatMessage: vi.fn(() => Promise.resolve({ message: "ok", board_updates_applied: [] })),
}));

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

async function renderBoard() {
  render(<KanbanBoard />);
  await waitFor(() => {
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });
}

describe("KanbanBoard", () => {
  it("renders five columns", async () => {
    await renderBoard();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("shows loading then board", async () => {
    render(<KanbanBoard />);
    expect(screen.getByText("Loading board...")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    });
  });

  it("renames a column", async () => {
    await renderBoard();
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("adds and removes a card", async () => {
    await renderBoard();
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    await waitFor(() => {
      expect(within(column).getByText("New card")).toBeInTheDocument();
    });

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    await waitFor(() => {
      expect(within(column).queryByText("New card")).not.toBeInTheDocument();
    });
  });
});
