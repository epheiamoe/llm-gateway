"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/ui");
      } else {
        const data = await res.json();
        setError(data.error || "Invalid password");
      }
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ width: 380, padding: 32 }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--green)", marginBottom: 4 }}>
          LLM Gateway<span style={{ color: "var(--text-dim)", fontWeight: 400 }}> //</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Enter admin password to continue</div>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password..."
            autoFocus
          />
        </div>
        {error && (
          <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 12 }}>{error}</div>
        )}
        <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
          {loading ? "Authenticating..." : "Login"}
        </button>
      </form>
    </div>
  );
}
