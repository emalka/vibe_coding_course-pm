"use client";

import { useState, type FormEvent } from "react";

type LoginFormProps = {
  onLogin: () => void;
};

export const LoginForm = ({ onLogin }: LoginFormProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.ok) {
        onLogin();
      } else {
        setError(data.detail || "Invalid credentials");
      }
    } catch {
      setError("Unable to connect to server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface)]">
      <div className="pointer-events-none absolute left-0 top-0 h-[500px] w-[500px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.15)_0%,_rgba(32,157,215,0.03)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[600px] w-[600px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.10)_0%,_rgba(117,57,145,0.03)_55%,_transparent_75%)]" />

      <div className="relative w-full max-w-sm">
        <div className="rounded-2xl border border-[var(--stroke)] bg-white/70 p-8 shadow-[var(--shadow)] backdrop-blur-sm">
          <div className="mb-8 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-[var(--gray-text)]">
              Project Board
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold text-[var(--navy-dark)]">
              Kanban Studio
            </h1>
            <p className="mt-2 text-sm text-[var(--gray-text)]">
              Sign in to access your board
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-[var(--stroke)] bg-white px-3 py-2.5 text-sm text-[var(--navy-dark)] focus:border-[var(--primary-blue)] focus:ring-1 focus:ring-[var(--primary-blue)]/20"
                required
                autoComplete="username"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-[var(--stroke)] bg-white px-3 py-2.5 text-sm text-[var(--navy-dark)] focus:border-[var(--primary-blue)] focus:ring-1 focus:ring-[var(--primary-blue)]/20"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600" data-testid="login-error">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[var(--secondary-purple)] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
