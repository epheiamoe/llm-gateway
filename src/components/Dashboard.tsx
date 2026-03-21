"use client";

import { useState, useEffect } from "react";
import { api, toast } from "@/components/ui";

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [modelStats, setModelStats] = useState<any[]>([]);
  const [sticky, setSticky] = useState<Record<string, any>>({});
  const [cooldowns, setCooldowns] = useState<Record<string, any>>({});
  const [models, setModels] = useState<any[]>([]);
  const [chains, setChains] = useState<any[]>([]);
  const [deployments, setDeployments] = useState<any[]>([]);
  // Pin form
  const [pinTarget, setPinTarget] = useState("");
  const [pinDep, setPinDep] = useState("");
  const [pinTtl, setPinTtl] = useState("120");

  useEffect(() => {
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, []);

  async function load() {
    try {
      const [s, logs, ms, st, cd, m, c, d] = await Promise.all([
        api("/stats"),
        api("/logs?limit=10"),
        api("/model-stats"),
        api("/sticky-routes"),
        api("/cooldowns"),
        api("/models"),
        api("/chains"),
        api("/deployments"),
      ]);
      setStats(s);
      setRecentLogs(Array.isArray(logs) ? logs : []);
      setModelStats(Array.isArray(ms) ? ms : []);
      setSticky(st && typeof st === "object" ? st : {});
      setCooldowns(cd && typeof cd === "object" ? cd : {});
      setModels(Array.isArray(m) ? m : []);
      setChains(Array.isArray(c) ? c : []);
      setDeployments(Array.isArray(d) ? d : []);
    } catch {}
  }

  async function clearSticky(model?: string) {
    try {
      const url = model ? `/sticky-routes?model=${encodeURIComponent(model)}` : "/sticky-routes";
      await api(url, { method: "DELETE" });
      toast("Sticky cleared");
      load();
    } catch (e: any) { toast(e.message, "error"); }
  }

  async function pinSticky() {
    if (!pinTarget || !pinDep) { toast("Select target and deployment", "error"); return; }
    const ttlMs = parseInt(pinTtl) * 60 * 1000;
    const modelName = pinTarget.startsWith("chain:")
      ? pinTarget.replace("chain:", "")
      : models.find((m: any) => m.id === pinTarget)?.name;
    if (!modelName) { toast("Invalid target", "error"); return; }
    try {
      await api("/sticky-routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName, deploymentId: pinDep, ttlMs }),
      });
      toast(`Pinned for ${pinTtl}min`);
      setPinTarget(""); setPinDep("");
      load();
    } catch (e: any) { toast(e.message, "error"); }
  }

  if (!stats) return <div style={{ color: "var(--text-dim)", padding: 40, textAlign: "center" }}>Loading...</div>;

  const stickyEntries = Object.entries(sticky);

  // Filter deployments based on selected pin target
  const filteredDeps = pinTarget
    ? deployments.filter((d: any) => {
        if (pinTarget.startsWith("chain:")) {
          const chainName = pinTarget.replace("chain:", "");
          const chain = chains.find((c: any) => c.name === chainName);
          if (!chain) return false;
          let items: any[] = [];
          try { items = JSON.parse(chain.items); } catch {}
          const modelIds = models.filter((m: any) => items.includes(m.name)).map((m: any) => m.id);
          return modelIds.includes(d.modelId);
        }
        return d.modelId === pinTarget;
      })
    : [];

  return (
    <div>
      {/* Sticky Routes - first section */}
      <div style={{ marginBottom: 24 }}>
        <div className="section-header">
          <div className="section-title">📌 Sticky Routes</div>
          {stickyEntries.length > 0 && (
            <button className="btn btn-sm btn-danger" onClick={() => clearSticky()}>Clear All</button>
          )}
        </div>

        {/* Pin form */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 16 }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label style={{ fontSize: 10 }}>Target</label>
            <select value={pinTarget} onChange={e => { setPinTarget(e.target.value); setPinDep(""); }} style={{ fontSize: 11 }}>
              <option value="">Select model/chain...</option>
              {chains.length > 0 && (
                <optgroup label="Chains">
                  {chains.map((c: any) => <option key={c.id} value={`chain:${c.name}`}>{c.name} (chain)</option>)}
                </optgroup>
              )}
              <optgroup label="Models">
                {models.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </optgroup>
            </select>
          </div>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label style={{ fontSize: 10 }}>Deployment</label>
            <select value={pinDep} onChange={e => setPinDep(e.target.value)} disabled={!pinTarget} style={{ fontSize: 11 }}>
              <option value="">Select deployment...</option>
              {filteredDeps.map((d: any) => (
                <option key={d.id} value={d.id}>{d.providerName} / {d.modelName}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ width: 80, marginBottom: 0 }}>
            <label style={{ fontSize: 10 }}>TTL (min)</label>
            <input type="number" value={pinTtl} onChange={e => setPinTtl(e.target.value)} min={1} max={1440} style={{ fontSize: 11 }} />
          </div>
          <button className="btn btn-primary" onClick={pinSticky} style={{ padding: "7px 14px", fontSize: 11 }}>⚡ Pin</button>
        </div>

        {/* Active sticky routes */}
        {stickyEntries.length === 0 ? (
          <div style={{ color: "var(--text-dim)", fontSize: 12, padding: "8px 0" }}>No active sticky routes</div>
        ) : (
          <div className="grid-3">
            {stickyEntries.map(([model, s]) => {
              const remainMin = Math.round((s.remainingMs || 0) / 60000);
              return (
                <div key={model} className="card" style={{ borderColor: "rgba(0,204,255,0.3)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--cyan)" }}>{model}</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {s.manual && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "rgba(170,102,255,0.15)", color: "var(--purple)" }}>PIN</span>}
                      <button className="btn btn-sm btn-danger" onClick={() => clearSticky(model)} style={{ padding: "2px 8px", fontSize: 10 }}>×</button>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                    → {s.providerName || "-"} / {s.modelName || "-"}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                    {remainMin > 0 ? `${remainMin} min remaining` : `${Math.round((s.remainingMs || 0) / 1000)}s remaining`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="stat-grid">
        <StatCard label="Total Requests" value={stats.totalRequests ?? 0} />
        <StatCard label="Success Rate" value={`${stats.successRate ?? 0}%`} />
        <StatCard label="Avg Latency" value={`${stats.avgLatencyMs ?? 0}ms`} />
        <StatCard label="Models" value={stats.modelCount ?? 0} />
        <StatCard label="Providers" value={stats.providerCount ?? 0} />
        <StatCard label="Last Hour" value={stats.lastHourRequests ?? 0} />
      </div>

      {/* Model Performance */}
      <div style={{ marginTop: 24 }}>
        <div className="section-header">
          <div className="section-title">Model Performance</div>
        </div>
        <div className="grid-3">
          {modelStats.map((m: any) => {
            const maxReqs = Math.max(...modelStats.map((x: any) => x.totalRequests || 1));
            const pct = ((m.totalRequests || 0) / maxReqs) * 100;
            const sr = m.totalRequests > 0 ? Math.round(((m.successCount || 0) / m.totalRequests) * 100) : 0;
            return (
              <div key={m.model} className="model-viz-card">
                <div className="model-viz-name">{m.model}</div>
                <div className="model-viz-bar">
                  <div className="model-viz-bar-fill" style={{ width: `${pct}%`, background: "var(--green)" }} />
                </div>
                <div className="model-viz-stats">
                  <span>{m.totalRequests} reqs</span>
                  <span>{sr}% ok</span>
                  <span>{m.avgLatencyMs ?? 0}ms avg</span>
                </div>
              </div>
            );
          })}
          {modelStats.length === 0 && (
            <div style={{ color: "var(--text-dim)", padding: 40, textAlign: "center", gridColumn: "1/-1" }}>No model stats yet</div>
          )}
        </div>
      </div>

      {/* Recent Requests */}
      <div style={{ marginTop: 24 }}>
        <div className="section-header">
          <div className="section-title">Recent Requests</div>
        </div>
        {recentLogs.length === 0 ? (
          <div style={{ color: "var(--text-dim)", fontSize: 12, padding: "12px 0" }}>No requests yet</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="log-table">
              <thead>
                <tr><th>Time</th><th>Model</th><th>Provider</th><th>Status</th><th>Latency</th><th>Tokens</th></tr>
              </thead>
              <tbody>
                {recentLogs.map((l: any) => (
                  <tr key={l.id}>
                    <td style={{ fontSize: 10, color: "var(--text-dim)", whiteSpace: "nowrap" }}>{new Date(l.createdAt).toLocaleTimeString()}</td>
                    <td style={{ color: "var(--green)" }}>{l.model || "-"}</td>
                    <td style={{ color: "var(--cyan)" }}>{l.providerName || "-"}</td>
                    <td style={{
                      color: l.status >= 200 && l.status < 300 ? "var(--green)" : l.status >= 400 && l.status < 500 ? "var(--amber)" : "var(--red)",
                      fontWeight: 700
                    }}>{l.status}</td>
                    <td>{l.latencyMs ?? "-"}ms</td>
                    <td style={{ color: "var(--text-dim)" }}>{(l.tokensIn || 0) + (l.tokensOut || 0) || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cooldowns */}
      {Object.keys(cooldowns).length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="section-header">
            <div className="section-title">⚠️ Active Cooldowns</div>
          </div>
          <div className="grid-3">
            {Object.entries(cooldowns).map(([key, cd]: [string, any]) => (
              <div key={key} className="card" style={{ borderColor: "rgba(255,51,85,0.3)" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--red)" }}>{key}</div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                  Errors: {cd.errors} · Until: {new Date(cd.until).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}