"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ToastContainer, RefreshProvider } from "@/components/ui";

const TABS = [
  { id: "dashboard", label: "Dashboard", href: "/ui" },
  { id: "playground", label: "Playground", href: "/ui/playground" },
  { id: "providers", label: "Providers", href: "/ui/providers" },
  { id: "models", label: "Models", href: "/ui/models" },
  { id: "chains", label: "Chains", href: "/ui/chains" },
  { id: "keys", label: "API Keys", href: "/ui/keys" },
  { id: "logs", label: "Logs", href: "/ui/logs" },
];

export default function UILayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [autoRefresh, setAutoRefresh] = useState(true);

  const activeTab = TABS.find(t => t.href === pathname)?.id
    || TABS.find(t => pathname.startsWith(t.href) && t.href !== "/ui")?.id
    || "dashboard";

  const handleLogout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }, [router]);

  return (
    <RefreshProvider>
      <nav className="nav">
        <div className="nav-logo">LLM Gateway<span> //</span></div>
        <div className="nav-tabs">
          {TABS.map(tab => (
            <div
              key={tab.id}
              className={`nav-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => router.push(tab.href)}
            >
              {tab.label}
            </div>
          ))}
        </div>
        <div className="nav-right">
          <label style={{ fontSize: 11, color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} style={{ accentColor: "var(--green)" }} />
            Auto
          </label>
          <div className="status-dot" />
          <button className="btn btn-sm" onClick={handleLogout}>Logout</button>
        </div>
      </nav>
      <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
        {children}
      </div>
      <ToastContainer />
    </RefreshProvider>
  );
}
