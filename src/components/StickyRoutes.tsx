"use client";

import { useState, useEffect } from "react";
import { api, toast, useConfirm } from "@/components/ui";

export default function StickyRoutes() {
  const [sticky, setSticky] = useState<any>({});
  const [models, setModels] = useState<any[]>([]);
  const [chains, setChains] = useState<any[]>([]);
  const [deployments, setDeployments] = useState<any[]>([]);
  const [selectedTarget, setSelectedTarget] = useState("");
  const [selectedDep, setSelectedDep] = useState("");
  const [ttl, setTtl] = useState("120");
  const confirm = useConfirm();

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, []);

  async function load() {
    try {
      const [s, m, c, d] = await Promise.all([api("/stats"), api("/models"), api("/chains"), api("/deployments")]);
      setSticky(s.sticky || {});
      setModels(m);
      setChains(c);
      setDeployments(d);
    } catch {}
  }

  async function pin() {
    if (!selectedTarget || !selectedDep) { toast("Select target and deployment", "error"); return; }
    const ttlMs = parseInt(ttl) * 60 * 1000;
    const modelName = selectedTarget.startsWith("chain:") ? selectedTarget.replace("chain:", "") : models.find((m: any) => m.id === selectedTarget)?.name;
    if (!modelName) { toast("Invalid target", "error"); return; }
    try {
      await api("/sticky-routes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelName, deploymentId: selectedDep, ttlMs }) });
      toast(`Pinned for ${ttl}min`);
      load();
    } catch (e: any) { toast(e.message, "error"); }
  }

  async function clear(model?: string) {
    if (model && !confirm(`Clear sticky route for "${model}"?`)) return;
    if (!model && !confirm("Clear all sticky routes?")) return;
    try {
      await api(model ? `/sticky-routes/${encodeURIComponent(model)}` : "/sticky-routes", { method: "DELETE" });
      toast("Cleared");
      load();
    } catch (e: any) { toast(e.message, "error"); }
  }

  const entries = Object.entries(sticky);
  const filteredDeps = selectedTarget
    ? deployments.filter((d: any) => {
        if (selectedTarget.startsWith("chain:")) {
          const chainName = selectedTarget.replace("chain:", "");
          const chain = chains.find((c: any) => c.name === chainName);
          if (!chain) return false;
          let items: any[] = [];
          try { items = JSON.parse(chain.items); } catch {}
          const modelNames = chain.mode === "models" ? items : [];
          const modelIds = models.filter((m: any) => modelNames.includes(m.name)).map((m: any) => m.id);
          return modelIds.includes(d.modelId);
        }
        return d.modelId === selectedTarget;
      })
    : [];

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Sticky Routes</div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 12 }}>
          Pin a specific deployment for a model or chain. Requests will prefer this deployment for the configured duration.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label>Target (Model or Chain)</label>
            <select value={selectedTarget} onChange={e => { setSelectedTarget(e.target.value); setSelectedDep(""); }}>
              <option value="">Select target...</option>
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
            <label>Deployment</label>
            <select value={selectedDep} onChange={e => setSelectedDep(e.target.value)} disabled={!selectedTarget}>
              <option value="">Select deployment...</option>
              {filteredDeps.map((d: any) => (
                <option key={d.id} value={d.id}>{d.providerName} / {d.modelName}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ width: 100, marginBottom: 0 }}>
            <label>Duration (min)</label>
            <input type="number" value={ttl} onChange={e => setTtl(e.target.value)} min={1} max={1440} />
          </div>
          <button className="btn btn-primary" onClick={pin} style={{ padding: "8px 16px" }}>⚡ Pin</button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div style={{ color: "var(--text-dim)", padding: 40, textAlign: "center" }}>No active sticky routes</div>
      ) : (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Active Routes</div>
            <button className="btn btn-sm btn-danger" onClick={() => clear()}>Clear All</button>
          </div>
          <div className="grid-2">
            {entries.map(([model, s]: [string, any]) => {
              const untilTs = Date.now() + s.remainingMs;
              const untilTime = new Date(untilTs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              const remainMin = Math.round(s.remainingMs / 60000);
              return (
                <div key={model} className="card" style={{ borderColor: "rgba(0,255,136,0.3)" }}>
                  <div className="card-header">
                    <div>
                      <div className="card-title">{model}</div>
                      <div className="card-meta">{s.providerName || "?"} / {s.deploymentId}</div>
                    </div>
                    <span className="card-badge badge-healthy">⚡ STICKY</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8 }}>
                    Until: {untilTime} ({remainMin} min remaining)
                    {s.manual && <span style={{ marginLeft: 8, color: "var(--amber)" }}>📌 Manual</span>}
                  </div>
                  <div className="card-actions" style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button className="btn btn-sm btn-danger" onClick={() => clear(model)}>Clear</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
