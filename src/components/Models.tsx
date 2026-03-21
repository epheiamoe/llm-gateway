"use client";

import { useState, useEffect } from "react";
import { api, toast, Modal, useConfirm } from "@/components/ui";

export default function Models() {
  const [models, setModels] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [modelModal, setModelModal] = useState(false);
  const [editingModel, setEditingModel] = useState<any>(null);
  const [modelName, setModelName] = useState("");
  const [depModal, setDepModal] = useState(false);
  const [editingDep, setEditingDep] = useState<any>(null);
  const [depModelId, setDepModelId] = useState("");
  const [depProvider, setDepProvider] = useState("");
  const [depModelName, setDepModelName] = useState("");
  const [depOrder, setDepOrder] = useState("1");
  const [depTimeout, setDepTimeout] = useState("60");
  const [depRetries, setDepRetries] = useState("2");
  const confirm = useConfirm();

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [m, s, p] = await Promise.all([api("/models"), api("/stats"), api("/providers")]);
      setModels(m); setStats(s); setProviders(p);
    } catch {}
  }

  function openModelModal(m?: any) {
    setEditingModel(m || null);
    setModelName(m?.name || "");
    setModelModal(true);
  }

  async function saveModel() {
    if (!modelName) { toast("Name required", "error"); return; }
    try {
      if (editingModel) {
        await api(`/models/${editingModel.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: modelName }) });
        toast("Model updated");
      } else {
        await api("/models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: modelName }) });
        toast("Model added");
      }
      setModelModal(false); load();
    } catch (e: any) { toast(e.message, "error"); }
  }

  async function deleteModel(m: any) {
    if (!confirm(`Delete "${m.name}"?`)) return;
    try { await api(`/models/${m.id}`, { method: "DELETE" }); toast("Deleted"); load(); }
    catch (e: any) { toast(e.message, "error"); }
  }

  function openDepModal(modelId: string, dep?: any) {
    setDepModelId(modelId);
    setEditingDep(dep || null);
    setDepProvider(dep?.providerId || "");
    setDepModelName(dep?.modelName || "");
    setDepOrder(String(dep?.order || 1));
    setDepTimeout(String(dep?.timeout || 60));
    setDepRetries(String(dep?.maxRetries ?? 2));
    setDepModal(true);
  }

  async function saveDep() {
    if (!depProvider || !depModelName) { toast("Provider and model name required", "error"); return; }
    const data = { modelId: depModelId, providerId: depProvider, modelName: depModelName, order: parseInt(depOrder), timeout: parseInt(depTimeout), maxRetries: parseInt(depRetries) };
    try {
      if (editingDep) {
        await api(`/models/${depModelId}/deployments/${editingDep.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
        toast("Deployment updated");
      } else {
        await api(`/models/${depModelId}/deployments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
        toast("Deployment added");
      }
      setDepModal(false); load();
    } catch (e: any) { toast(e.message, "error"); }
  }

  async function deleteDep(modelId: string, depId: string) {
    try { await api(`/models/${modelId}/deployments/${depId}`, { method: "DELETE" }); toast("Removed"); load(); }
    catch (e: any) { toast(e.message, "error"); }
  }

  async function toggleDep(modelId: string, dep: any) {
    try {
      await api(`/models/${modelId}/deployments/${dep.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: dep.enabled ? 0 : 1 }) });
      load();
    } catch {}
  }

  async function reorderDep(modelId: string, depId: string, newOrder: number) {
    try {
      await api(`/models/${modelId}/deployments/${depId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: newOrder }) });
      load();
    } catch {}
  }

  const cooldowns = stats.cooldowns || {};
  const depStats = stats.deploymentStats || {};
  const provMap: Record<string, string> = {};
  providers.forEach((p: any) => { provMap[p.id] = p.name; });

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Models & Deployments</div>
        <button className="btn btn-primary" onClick={() => openModelModal()}>+ Add Model</button>
      </div>

      {models.length === 0 ? (
        <div style={{ color: "var(--text-dim)", padding: 40, textAlign: "center" }}>No models yet.</div>
      ) : (
        <div className="grid-2">
          {models.map((m: any) => {
            const deps = m.deployments || [];
            const cd = cooldowns;
            return (
              <div key={m.id} className="card">
                <div className="card-header">
                  <div className="card-title">{m.name}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-sm" onClick={() => openModelModal(m)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => deleteModel(m)}>Delete</button>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 8 }}>
                  {deps.length} deployment{deps.length !== 1 ? "s" : ""}
                </div>
                {deps.map((d: any, i: number) => {
                  const pName = d.providerName || provMap[d.providerId] || "?";
                  const cdKey = `${d.providerId}::${d.modelName}`;
                  const isCooling = !!cd[cdKey];
                  const ds = depStats[d.id];
                  return (
                    <div key={d.id} className="dep-item" style={{ opacity: d.enabled ? 1 : 0.4 }}>
                      <span className="dep-order">{d.order}</span>
                      <span style={{ flex: 1 }}>
                        <span style={{ color: "var(--cyan)" }}>{pName}</span>
                        <span style={{ color: "var(--text-dim)" }}> / </span>
                        <span style={{ color: "var(--green)" }}>{d.modelName}</span>
                      </span>
                      {isCooling && <span className="card-badge badge-offline" style={{ fontSize: 9 }}>COOLDOWN</span>}
                      {ds && <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{ds.total}req {ds.successRate}%</span>}
                      <button className="btn btn-sm" style={{ padding: "2px 6px", fontSize: 10 }} onClick={() => toggleDep(m.id, d)}>{d.enabled ? "ON" : "OFF"}</button>
                      <button className="btn btn-sm" style={{ padding: "2px 6px", fontSize: 10 }} onClick={() => openDepModal(m.id, d)}>✎</button>
                      <button className="btn btn-sm btn-danger" style={{ padding: "2px 6px", fontSize: 10 }} onClick={() => deleteDep(m.id, d.id)}>✕</button>
                    </div>
                  );
                })}
                <div style={{ marginTop: 8 }}>
                  <button className="btn btn-sm" onClick={() => openDepModal(m.id)}>+ Add Deployment</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Model Modal */}
      <Modal open={modelModal} onClose={() => setModelModal(false)} title={editingModel ? "Edit Model" : "Add Model"}>
        <div className="form-group"><label>Model Name (the name clients will use)</label>
          <input type="text" value={modelName} onChange={e => setModelName(e.target.value)} placeholder="e.g. claude-opus, gpt-4o" />
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={() => setModelModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveModel}>Save</button>
        </div>
      </Modal>

      {/* Deployment Modal */}
      <Modal open={depModal} onClose={() => setDepModal(false)} title={editingDep ? "Edit Deployment" : "Add Deployment"}>
        <div className="form-group"><label>Provider</label>
          <select value={depProvider} onChange={e => setDepProvider(e.target.value)}>
            <option value="">Select provider...</option>
            {providers.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.apiType})</option>)}
          </select>
        </div>
        <div className="form-group"><label>Actual Model Name (at provider)</label>
          <input type="text" value={depModelName} onChange={e => setDepModelName(e.target.value)} placeholder="e.g. claude-opus-4-5" />
        </div>
        <div className="form-group"><label>Priority (lower = higher priority)</label>
          <input type="number" value={depOrder} onChange={e => setDepOrder(e.target.value)} min={1} />
        </div>
        <div className="form-group"><label>Timeout (seconds)</label>
          <input type="number" value={depTimeout} onChange={e => setDepTimeout(e.target.value)} min={5} />
        </div>
        <div className="form-group"><label>Max Retries</label>
          <input type="number" value={depRetries} onChange={e => setDepRetries(e.target.value)} min={0} />
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={() => setDepModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveDep}>Save</button>
        </div>
      </Modal>
    </div>
  );
}
