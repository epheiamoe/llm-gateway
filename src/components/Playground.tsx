"use client";

import { useState, useEffect } from "react";
import { api, toast } from "@/components/ui";

export default function Playground() {
  const [models, setModels] = useState<any[]>([]);
  const [chains, setChains] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [tab, setTab] = useState<"model" | "chain" | "custom">("model");
  const [selected, setSelected] = useState<any>(null);
  const [message, setMessage] = useState("Say hello in 5 words");
  const [customModel, setCustomModel] = useState("");
  const [customProvider, setCustomProvider] = useState("");
  const [trace, setTrace] = useState<any>(null);
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [m, c, p] = await Promise.all([api("/models"), api("/chains"), api("/providers")]);
      setModels(m); setChains(c.filter((ch: any) => ch.enabled)); setProviders(p);
      if (p.length > 0) setCustomProvider(p[0].id);
    } catch {}
  }

  function selectTarget(type: string, name: string, extra?: any) {
    setSelected({ type, name, ...extra });
  }

  async function run() {
    let model = "";
    let providerId: string | undefined;
    if (tab === "model" && selected?.type === "model") model = selected.name;
    else if (tab === "chain" && selected?.type === "chain") model = selected.name;
    else if (tab === "custom") { model = customModel; providerId = customProvider; }
    if (!model) { toast("Select a target first", "error"); return; }

    setLoading(true); setTrace(null); setResponse(null);
    try {
      const body: any = { model, message };
      if (providerId) body.providerId = providerId;
      const res = await fetch("/api/test-route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (res.ok) { setTrace(data); setResponse(data); }
      else { setTrace({ success: false, error: data.error || "Request failed" }); setResponse(null); }
    } catch (e: any) {
      setTrace({ success: false, error: e.message });
    } finally { setLoading(false); }
  }

  function copyResp() {
    const text = response?.response?.text || "";
    if (text) { navigator.clipboard.writeText(text); toast("Copied"); }
  }

  return (
    <div>
      <div className="section-title" style={{ marginBottom: 16 }}>Route Playground</div>
      <div className="playground-layout">
        {/* Left: Input */}
        <div className="playground-input">
          <div className="section-title" style={{ fontSize: 13, marginBottom: 16 }}>Select Target</div>
          <div className="pg-target-tabs">
            <div className={`pg-target-tab ${tab === "model" ? "active" : ""}`} onClick={() => setTab("model")}>Models</div>
            <div className={`pg-target-tab ${tab === "chain" ? "active" : ""}`} onClick={() => setTab("chain")}>Chains</div>
            <div className={`pg-target-tab ${tab === "custom" ? "active" : ""}`} onClick={() => setTab("custom")}>Custom</div>
          </div>

          {tab === "model" && (
            <div className="pg-selector-grid">
              {models.map((m: any) => (
                <div key={m.id} className={`pg-selector-item ${selected?.type === "model" && selected?.name === m.name ? "selected" : ""}`}
                  onClick={() => selectTarget("model", m.name)}>
                  <div className="pg-selector-icon pg-selector-icon-model">🎯</div>
                  <div className="pg-selector-info">
                    <div className="pg-selector-name">{m.name}</div>
                    <div className="pg-selector-meta">{(m.deployments || []).length} deployments</div>
                  </div>
                  <div className="pg-selector-check">✓</div>
                </div>
              ))}
              {models.length === 0 && <div style={{ color: "var(--text-dim)", padding: 20, textAlign: "center", fontSize: 11 }}>No models</div>}
            </div>
          )}

          {tab === "chain" && (
            <div className="pg-selector-grid">
              {chains.map((c: any) => (
                <div key={c.id} className={`pg-selector-item ${selected?.type === "chain" && selected?.name === c.name ? "selected" : ""}`}
                  onClick={() => selectTarget("chain", c.name)}>
                  <div className="pg-selector-icon pg-selector-icon-chain-models">⛓</div>
                  <div className="pg-selector-info">
                    <div className="pg-selector-name">{c.name}</div>
                    <div className="pg-selector-meta">{c.mode}</div>
                  </div>
                  <div className="pg-selector-check">✓</div>
                </div>
              ))}
              {chains.length === 0 && <div style={{ color: "var(--text-dim)", padding: 20, textAlign: "center", fontSize: 11 }}>No active chains</div>}
            </div>
          )}

          {tab === "custom" && (
            <div>
              <div className="form-group">
                <label>Model Name</label>
                <input type="text" value={customModel} onChange={e => setCustomModel(e.target.value)} placeholder="e.g. claude-sonnet-4" />
              </div>
              <div className="form-group">
                <label>Provider</label>
                <select value={customProvider} onChange={e => setCustomProvider(e.target.value)}>
                  {providers.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.apiType})</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="form-group" style={{ marginTop: 16 }}>
            <label>Test Message</label>
            <input type="text" value={message} onChange={e => setMessage(e.target.value)} placeholder="Test message..." />
          </div>

          <button className="btn btn-primary" onClick={run} disabled={loading} style={{ width: "100%", padding: 10, fontSize: 13 }}>
            {loading ? "⏳ Routing..." : "▶ Send Test Request"}
          </button>
        </div>

        {/* Right: Output */}
        <div className="playground-output">
          <div>
            <div className="section-title playground-panel-title">Route Trace</div>
            {!trace ? (
              <div style={{ color: "var(--text-dim)", textAlign: "center", padding: 40 }}>Select a model or chain and send a request</div>
            ) : trace.success === false ? (
              <div style={{ color: "var(--red)", padding: 20 }}>Error: {trace.error || "Unknown error"}</div>
            ) : (
              <div className="trace-flow">
                {(trace.steps || []).map((s: any, i: number) => {
                  let icon = "?", color = "var(--text-dim)", label = s.action;
                  if (s.action === "try_model") { icon = "🎯"; color = "var(--blue)"; label = "Try Model"; }
                  else if (s.action === "try_deployment") { icon = "→"; color = "var(--amber)"; label = "Try Deployment"; }
                  else if (s.action === "success") { icon = "✓"; color = "var(--green)"; label = "Success"; }
                  else if (s.action === "fail") { icon = "✗"; color = "var(--red)"; label = "Failed"; }
                  return (
                    <div key={i} className="trace-step">
                      <div className="trace-dot" style={{ background: `${color}33`, color, border: `2px solid ${color}` }}>{icon}</div>
                      <div className="trace-content">
                        <div className="trace-action">{label}</div>
                        <div className="trace-detail">{s.model || ""} {s.provider ? `@ ${s.provider}` : ""} {s.error ? `— ${s.error}` : ""}</div>
                      </div>
                    </div>
                  );
                })}
                <div className="trace-summary">
                  <div className="trace-summary-row"><span className="trace-summary-label">Result</span>
                    <span className="trace-summary-value" style={{ color: trace.success ? "var(--green)" : "var(--red)" }}>
                      {trace.success ? "✓ Success" : "✗ Failed"}
                    </span>
                  </div>
                  <div className="trace-summary-row"><span className="trace-summary-label">Total Latency</span><span className="trace-summary-value">{trace.totalLatencyMs}ms</span></div>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="playground-panel-title-row">
              <div className="section-title playground-panel-title" style={{ marginBottom: 0 }}>Model Response</div>
              <button className="btn btn-sm" onClick={copyResp} disabled={!response?.response?.text}>Copy</button>
            </div>
            {!response ? (
              <div className="playground-response-empty">Successful requests show model text here</div>
            ) : (
              <pre className="response-box playground-response-box">{response.response?.text || "No text response"}</pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
