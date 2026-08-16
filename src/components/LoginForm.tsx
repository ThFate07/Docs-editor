"use client";

import { useState } from "react";

export default function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("That password isn't right.");
      return;
    }
    window.location.reload();
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="card w-full max-w-sm p-8 rounded-sm">
        <div className="mb-6">
          <span className="stamp text-stamp-red text-xs">Restricted</span>
        </div>
        <h1 className="font-mono text-xl font-semibold mb-1">Duplicate</h1>
        <p className="text-sm text-ink-muted mb-6">
          Enter the password to open your experiment-doc workspace.
        </p>
        <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-line bg-paper-card px-3 py-2 mb-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ink/20 rounded-sm"
        />
        {error && <p className="text-sm text-stamp-red mb-3">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full bg-ink text-paper-card py-2 text-sm font-medium rounded-sm disabled:opacity-40 hover:opacity-90 transition"
        >
          {loading ? "Checking…" : "Enter"}
        </button>
      </form>
    </main>
  );
}
