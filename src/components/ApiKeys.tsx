"use client";

import { useState, useEffect } from "react";
import { api, toast, Modal, useConfirm } from "@/components/ui";

export default function ApiKeys() {
  const [keys, setKeys] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState("");
  const [allowed, setAllowed] = useState("");
  const [rateLimit, setRateLimit] = useState("0");
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const confirm = useConfirm();

  useEffect(() => { load(); }, []);

  async function load() {
    try { setKeys(await api("/keys")); } catch {}
  }

  function openModal(k?: any) {
    setEditing(k || null);
    setName(k?.name || "");
    setAllowed(k?.allowedModels || "");
    setRateLimit(String(k?.rateLimit || 0));
    setModal(true);
  }

  async function save() {
    if (!name) { toast("Name required", "error"); return; }
    const body = { name, allowedModels: allowed, rateLimit: parseInt(rateLimit) };
    try {
      if (editing) {
        await api(`/keys/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        toast("Key updated");
      } else {
        await api("/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        toast("Key created");
      }
      setModal(false); load();
    } catch (e: any) { toast(e.message, "error"); }
  }

  async function del(k: any) {
    if (!confirm(`Delete "${k.name}"?`)) return;
    try { await api(`/keys/${k.id}`, { method: "DELETE" }); toast("Deleted"); load(); }
    catch (e: any) { toast(e.message, "error"); }
  }

  async function toggle(k: any) {
    try {
      await api(`/keys/${k.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: k.enabled ? 0 : 1 }) });
      load();
    } catch {}
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key);
    toast("Copied to clipboard");
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title">API Keys</div>
        <button className="btn btn-primary" onClick={() => openModal()}>+ Create Key</button>
      </div>

      {keys.length === 0 ? (
        <div style={{ color: "var(--text-dim)", padding: 40, textAlign: "center" }}>
          No API keys. Gateway runs in open mode (no auth required for /v1/* endpoints).
        </div>
      ) : (
        <div className="grid-2">
          {keys.map((k: any) => (
            <div key={k.id} className="card" style={{ opacity: k.enabled ? 1 : 0.5 }}>
              <div className="card-header">
                <div className="card-title">{k.name}</div>
                <span className={`card-badge ${k.enabled ? "badge-healthy" : "badge-offline"}`}>
                  {k.enabled ? "ACTIVE" : "DISABLED"}
                </span>
              </div>
              <div className="key-display">
                <span className="key-text" style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: visibleKeys[k.id] ? 0 : 2 }}>
                  {visibleKeys[k.id] ? k.key : "••••••••••••••••••••"}
                </span>
                <span style={{ cursor: "pointer", fontSize: 12, opacity: 0.6 }} onClick={() => setVisibleKeys(v => ({ ...v, [k.id]: !v[k.id] }))} title={visibleKeys[k.id] ? "Hide" : "Show"}>
                  {visibleKeys[k.id] ? "🙈" : "👁"}
                </span>
                <span className="key-copy" onClick={() => copyKey(k.key)}>📋</span>
              </div>
              <div className="key-stats">
                <span>Used: {k.usageCount || 0} times</span>
                {k.allowedModels && <span>Models: {k.allowedModels}</span>}
                {k.rateLimit > 0 && <span>Rate: {k.rateLimit}/min</span>}
              </div>
              <div className="card-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                <button className="btn btn-sm" onClick={() => toggle(k)}>{k.enabled ? "Disable" : "Enable"}</button>
                <button className="btn btn-sm" onClick={() => openModal(k)}>Edit</button>
                <button className="btn btn-sm btn-danger" onClick={() => del(k)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? "Edit API Key" : "Create API Key"}>
        <div className="form-group"><label>Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. OpenClaw, Dev Testing" />
        </div>
        <div className="form-group">
          <label>Allowed Models (comma separated, empty = all)</label>
          <input type="text" value={allowed} onChange={e => setAllowed(e.target.value)} placeholder="claude-opus, claude-sonnet" />
          <div className="form-hint">Leave empty to allow access to all models</div>
        </div>
        <div className="form-group"><label>Rate Limit (requests/min, 0 = unlimited)</label>
          <input type="number" value={rateLimit} onChange={e => setRateLimit(e.target.value)} min={0} />
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </div>
      </Modal>
    </div>
  );
}
