import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatSidebar } from "@/components/ChatSidebar";
import { vi } from "vitest";

const mockSendChatMessage = vi.fn();

vi.mock("@/lib/api", () => ({
  sendChatMessage: (...args: unknown[]) => mockSendChatMessage(...args),
}));

function renderSidebar(props: Partial<React.ComponentProps<typeof ChatSidebar>> = {}) {
  const defaults = {
    open: true,
    onToggle: vi.fn(),
    onBoardUpdated: vi.fn(),
  };
  return render(<ChatSidebar {...defaults} {...props} />);
}

describe("ChatSidebar", () => {
  beforeEach(() => {
    mockSendChatMessage.mockReset();
  });

  it("renders when open", () => {
    renderSidebar();
    expect(screen.getByText("AI Assistant")).toBeInTheDocument();
    expect(screen.getByTestId("chat-input")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send message/i })).toBeInTheDocument();
  });

  it("has translate-x-full class when closed", () => {
    renderSidebar({ open: false });
    const sidebar = screen.getByTestId("chat-sidebar");
    expect(sidebar.className).toContain("translate-x-full");
  });

  it("calls onToggle when toggle button is clicked", async () => {
    const onToggle = vi.fn();
    renderSidebar({ onToggle });
    await userEvent.click(screen.getByRole("button", { name: /close ai chat/i }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("sends a message and displays user + AI response", async () => {
    mockSendChatMessage.mockResolvedValue({
      message: "I can help with that!",
      board_updates_applied: [],
    });

    const onBoardUpdated = vi.fn();
    renderSidebar({ onBoardUpdated });

    const input = screen.getByTestId("chat-input");
    await userEvent.type(input, "Hello AI");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));

    // User message appears
    expect(screen.getByText("Hello AI")).toBeInTheDocument();

    // AI response appears
    await waitFor(() => {
      expect(screen.getByText("I can help with that!")).toBeInTheDocument();
    });

    // No board updates, so onBoardUpdated should NOT be called
    expect(onBoardUpdated).not.toHaveBeenCalled();

    // Input is cleared
    expect(input).toHaveValue("");
  });

  it("shows loading indicator during AI call", async () => {
    let resolveResponse: (value: unknown) => void;
    mockSendChatMessage.mockReturnValue(
      new Promise((r) => { resolveResponse = r; })
    );

    renderSidebar();

    await userEvent.type(screen.getByTestId("chat-input"), "test");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));

    // Loading indicator visible
    expect(screen.getByTestId("chat-loading")).toBeInTheDocument();

    // Resolve the promise
    resolveResponse!({ message: "Done", board_updates_applied: [] });

    await waitFor(() => {
      expect(screen.queryByTestId("chat-loading")).not.toBeInTheDocument();
    });
  });

  it("calls onBoardUpdated when AI returns board updates", async () => {
    mockSendChatMessage.mockResolvedValue({
      message: "Created a card!",
      board_updates_applied: [{ op: "create_card", card: { id: 99 } }],
    });

    const onBoardUpdated = vi.fn();
    renderSidebar({ onBoardUpdated });

    await userEvent.type(screen.getByTestId("chat-input"), "Create a card");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => {
      expect(screen.getByText("Created a card!")).toBeInTheDocument();
    });

    expect(onBoardUpdated).toHaveBeenCalledOnce();
  });

  it("sends Enter key to submit", async () => {
    mockSendChatMessage.mockResolvedValue({
      message: "Got it",
      board_updates_applied: [],
    });

    renderSidebar();

    const input = screen.getByTestId("chat-input");
    await userEvent.type(input, "Hello{Enter}");

    await waitFor(() => {
      expect(screen.getByText("Got it")).toBeInTheDocument();
    });
  });

  it("shows error message on API failure", async () => {
    mockSendChatMessage.mockRejectedValue(new Error("Network error"));

    renderSidebar();

    await userEvent.type(screen.getByTestId("chat-input"), "test");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument();
    });
  });

  it("passes conversation history to API", async () => {
    mockSendChatMessage
      .mockResolvedValueOnce({ message: "First reply", board_updates_applied: [] })
      .mockResolvedValueOnce({ message: "Second reply", board_updates_applied: [] });

    renderSidebar();

    // Send first message
    await userEvent.type(screen.getByTestId("chat-input"), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() => expect(screen.getByText("First reply")).toBeInTheDocument());

    // Send second message
    await userEvent.type(screen.getByTestId("chat-input"), "Follow up");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));
    await waitFor(() => expect(screen.getByText("Second reply")).toBeInTheDocument());

    // Second call should include history of first exchange
    const secondCall = mockSendChatMessage.mock.calls[1];
    expect(secondCall[0]).toBe("Follow up");
    expect(secondCall[1]).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "First reply" },
    ]);
  });

  it("disables send button when input is empty", () => {
    renderSidebar();
    const sendBtn = screen.getByRole("button", { name: /send message/i });
    expect(sendBtn).toBeDisabled();
  });
});
