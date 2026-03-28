"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";

type AuthState = "loading" | "logged-in" | "logged-out";

export default function Home() {
  const [auth, setAuth] = useState<AuthState>("loading");

  const checkAuth = async () => {
    try {
      const res = await fetch("/api/me");
      setAuth(res.ok ? "logged-in" : "logged-out");
    } catch {
      setAuth("logged-out");
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    setAuth("logged-out");
  };

  if (auth === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)]">
        <p className="text-sm text-[var(--gray-text)]">Loading...</p>
      </div>
    );
  }

  if (auth === "logged-out") {
    return <LoginForm onLogin={() => setAuth("logged-in")} />;
  }

  return <KanbanBoard onLogout={handleLogout} />;
}
