"use client";

import { useState, useEffect } from "react";
import { api, toast, Modal, useConfirm } from "@/components/ui";

interface Provider {
  id: string; name: string; baseUrl: string; apiKey: string;
  apiType: string; tags: string; customHeaders: string;
}

export default function Providers() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Provider | null>(null);
  const confirm = useConfirm();

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiType, setApiType] = useState("openai");
  const [tags, setTags] = useState("");
  const [customHeaders, setCustomHeaders] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    try { setProviders(await api("/providers")); } catch {}
  }

  function openModal(p?: Provider) {
    if (p) {
      setEditing(p); setName(p.name); setBaseUrl(p.baseUrl);
      setApiKey(""); setApiType(p.apiType); setTags(p.tags || "");
      setCustomHeaders(p.customHeaders || "");
    } else {
      setEditing(null); setName(""); setBaseUrl("");
      setApiKey(""); setApiType("openai"); setTags(""); setCustomHeaders("");
    }
    setModal(true);
  }

  async function save() {
    if (!name) { toast("Name required", "error"); return; }
    const body: any = { name, baseUrl, apiType, tags, customHeaders };
    if (apiKey) body.apiKey = apiKey;
    try {
      if (editing) {
        await api(`/providers/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        toast("Provider updated");
      } else {
        body.apiKey = apiKey;
        await api("/providers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        toast("Provider added");
      }
      setModal(false); load();
    } catch (e: any) { toast(e.message, "error"); }
  }

  async function del(p: Provider) {
    if (!confirm(`Delete "${p.name}"?`)) return;
    try { await api(`/providers/${p.id}`, { method: "DELETE" }); toast("Deleted"); load(); }
    catch (e: any) { toast(e.message, "error"); }
  }

  async function test(id: string) {
    try {
      const d = await api(`/providers/${id}/test`, { method: "POST" });
      d.ok ? toast(`OK (${d.status})`) : toast(`Failed: ${d.message || "?"}`, "error");
    } catch (e: any) { toast(`Error: ${e.message}`, "error"); }
  }

  const filtered = search
    ? providers.filter(p => [p.name, p.baseUrl, p.apiType, p.tags].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase()))
    : providers;

  return (
    <div>
      <div className="section-header">
        <div>
          <span className="section-title">Providers</span>
          <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 12 }}>
            {filtered.length === providers.length ? `${providers.length} provider${providers.length !== 1 ? "s" : ""}` : `${filtered.length} of ${providers.length} providers`}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: 200, padding: "6px 10px", fontSize: 11 }} />
          <button className="btn btn-primary" onClick={() => openModal()}>+ Add Provider</button>
        </div>
      </div>

      {providers.length === 0 ? (
        <div style={{ color: "var(--text-dim)", padding: 40, textAlign: "center" }}>No providers. Add one to start.</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: "var(--text-dim)", padding: 40, textAlign: "center" }}>No providers match your search.</div>
      ) : (
        <div className="grid-2">
          {filtered.map(p => {
            const badgeCls = p.apiType === "anthropic" ? "badge-degraded" : p.apiType === "gemini" ? "badge-offline" : "badge-healthy";
            return (
              <div key={p.id} className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">{p.name}</div>
                    <div className="card-meta">{p.baseUrl}</div>
                  </div>
                  <span className={`card-badge ${badgeCls}`}>{p.apiType}</span>
                </div>
                <div className="card-meta">Key: {p.apiKey ? "••••••••••••••••" : "none"}</div>
                {p.tags && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                    {p.tags.split(",").filter(Boolean).map((t, i) => (
                      <span key={i} style={{ padding: "1px 6px", borderRadius: 4, fontSize: 10, background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-dim)" }}>{t.trim()}</span>
                    ))}
                  </div>
                )}
                <div className="card-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                  <button className="btn btn-sm" onClick={() => test(p.id)}>Test</button>
                  <button className="btn btn-sm" onClick={() => openModal(p)}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => del(p)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? "Edit Provider" : "Add Provider"}>
        <div className="form-group"><label>Name</label><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. OpenAI, Anthropic AWS" /></div>
        <div className="form-group"><label>Base URL</label><input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.openai.com" /></div>
        <div className="form-group"><label>API Key</label><input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={editing ? "(unchanged)" : "sk-..."} /></div>
        <div className="form-group"><label>API Type</label>
          <select value={apiType} onChange={e => setApiType(e.target.value)}>
            <option value="openai">OpenAI Compatible</option>
            <option value="openai-responses">OpenAI Responses</option>
            <option value="anthropic">Anthropic Messages</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </div>
        <div className="form-group"><label>Tags (comma separated)</label><input type="text" value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g. cheap, fast, backup" /></div>
        <div className="form-group"><label>Custom Headers (JSON)</label><textarea value={customHeaders} onChange={e => setCustomHeaders(e.target.value)} rows={3} placeholder='{"User-Agent": "my-app"}' /></div>
        <div className="modal-actions">
          <button className="btn" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </div>
      </Modal>
    </div>
  );
}
