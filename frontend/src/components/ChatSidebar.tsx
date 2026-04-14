"use client";

import { useRef, useState, useEffect } from "react";
import { sendChatMessage, type ChatMessage } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

type DisplayMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatSidebarProps = {
  open: boolean;
  onToggle: () => void;
  onBoardUpdated: (board?: BoardData) => void;
};

export const ChatSidebar = ({ open, onToggle, onBoardUpdated }: ChatSidebarProps) => {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const buildHistory = (): ChatMessage[] =>
    messages.map((m) => ({ role: m.role, content: m.content }));

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const res = await sendChatMessage(text, buildHistory());
      setMessages((prev) => [...prev, { role: "assistant", content: res.message }]);
      if (res.board_updates_applied.length > 0) {
        // Pass the fresh board from the response if available; caller falls back to refetch
        onBoardUpdated(res.board);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Toggle button */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={open ? "Close AI chat" : "Open AI chat"}
        className="fixed right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--secondary-purple)] text-white shadow-lg transition hover:scale-105 hover:bg-[#8a44a8]"
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        )}
      </button>

      {/* Sidebar panel */}
      <div
        data-testid="chat-sidebar"
        className={`fixed right-0 top-0 z-40 flex h-full w-[380px] max-w-[90vw] flex-col border-l border-[var(--stroke)] bg-white shadow-[-8px_0_32px_rgba(3,33,71,0.08)] transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--stroke)] px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--secondary-purple)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          </div>
          <div>
            <h2 className="text-sm font-bold text-[var(--navy-dark)]">AI Assistant</h2>
            <p className="text-[11px] text-[var(--gray-text)]">Ask me to manage your board</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4" data-testid="chat-messages">
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <p className="text-center text-xs text-[var(--gray-text)]">
                Ask the AI to create, move, or edit cards on your board.
              </p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`mb-3 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[var(--secondary-purple)] text-white"
                    : "border border-[var(--stroke)] bg-[var(--surface)] text-[var(--navy-dark)]"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="mb-3 flex justify-start" data-testid="chat-loading">
              <div className="flex items-center gap-1.5 rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3.5 py-2.5">
                <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--gray-text)] [animation-delay:-0.3s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--gray-text)] [animation-delay:-0.15s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--gray-text)]" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-[var(--stroke)] px-4 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask AI something..."
              disabled={loading}
              className="flex-1 bg-transparent text-sm text-[var(--navy-dark)] placeholder:text-[var(--gray-text)] focus:outline-none disabled:opacity-50"
              data-testid="chat-input"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={loading || !input.trim()}
              aria-label="Send message"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--secondary-purple)] text-white transition hover:bg-[#8a44a8] disabled:opacity-40"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
