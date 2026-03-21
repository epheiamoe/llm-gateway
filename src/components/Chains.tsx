"use client";

import { useState, useEffect, useRef } from "react";
import { api, toast, Modal, useConfirm } from "@/components/ui";

export default function Chains() {
  const [chains, setChains] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [chainName, setChainName] = useState("");
  const [chainMode, setChainMode] = useState("models");
  const [builderData, setBuilderData] = useState<any[]>([]);
  const confirm = useConfirm();
  const dragIdx = useRef<number | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [c, m, p] = await Promise.all([api("/chains"), api("/models"), api("/providers")]);
      setChains(c); setModels(m); setProviders(p);
    } catch {}
  }

  function buildModelsData(existingItems?: string[]) {
    const allNames = models.map((m: any) => m.name);
    const enabled = new Set(existingItems || []);
    const ordered: any[] = [];
    if (existingItems) {
      existingItems.forEach(name => {
        if (allNames.includes(name)) ordered.push({ name, enabled: true });
      });
    }
    allNames.forEach(name => {
      if (!ordered.find((o: any) => o.name === name)) {
        ordered.push({ name, enabled: existingItems ? enabled.has(name) : true });
      }
    });
    return ordered;
  }

  function buildProviderData(existingItems?: any[]) {
    const provMap: Record<string, any[]> = {};
    models.forEach((m: any) => {
      (m.deployments || []).forEach((d: any) => {
        const pName = d.providerName || "Unknown";
        if (!provMap[pName]) provMap[pName] = [];
        provMap[pName].push({ name: d.modelName, enabled: true, deploymentId: d.id });
      });
    });

    if (existingItems) {
      const result: any[] = [];
      existingItems.forEach((item: any) => {
        const pModels = provMap[item.provider];
        if (pModels) {
          const enabledModels = new Set(item.models || []);
          result.push({
            provider: item.provider, enabled: true,
            models: pModels.map(m => ({ ...m, enabled: enabledModels.has(m.name) }))
          });
        }
      });
      Object.keys(provMap).forEach(pName => {
        if (!result.find(r => r.provider === pName)) {
          result.push({ provider: pName, enabled: false, models: provMap[pName].map(m => ({ ...m, enabled: false })) });
        }
      });
      return result;
    }

    return Object.entries(provMap).map(([provider, pModels]) => ({
      provider, enabled: true, models: pModels
    }));
  }

  function openModal(chain?: any) {
    setEditing(chain || null);
    setChainName(chain?.name || "");
    const mode = chain?.mode || "models";
    setChainMode(mode);
    let items: any;
    try { items = chain ? JSON.parse(chain.items) : undefined; } catch { items = undefined; }
    if (mode === "models") {
      setBuilderData(buildModelsData(items));
    } else {
      setBuilderData(buildProviderData(items));
    }
    setModal(true);
  }

  function rebuildBuilder(mode: string) {
    setChainMode(mode);
    if (mode === "models") setBuilderData(buildModelsData());
    else setBuilderData(buildProviderData());
  }

  function toggleItem(idx: number) {
    setBuilderData(prev => prev.map((item, i) => i === idx ? { ...item, enabled: !item.enabled } : item));
  }

  function toggleSubItem(pIdx: number, mIdx: number) {
    setBuilderData(prev => prev.map((item, i) => {
      if (i !== pIdx) return item;
      return { ...item, models: item.models.map((m: any, j: number) => j === mIdx ? { ...m, enabled: !m.enabled } : m) };
    }));
  }

  function handleDragStart(idx: number) { dragIdx.current = idx; }
  function handleDrop(targetIdx: number) {
    if (dragIdx.current === null || dragIdx.current === targetIdx) return;
    setBuilderData(prev => {
      const next = [...prev];
      const [item] = next.splice(dragIdx.current!, 1);
      next.splice(targetIdx, 0, item);
      return next;
    });
    dragIdx.current = null;
  }

  async function saveChain() {
    if (!chainName) { toast("Name required", "error"); return; }
    let items: any;
    if (chainMode === "models") {
      items = builderData.filter(i => i.enabled).map(i => i.name);
    } else {
      items = builderData.filter(i => i.enabled).map(i => ({
        provider: i.provider,
        models: i.models.filter((m: any) => m.enabled).map((m: any) => m.name)
      }));
    }
    const body = { name: chainName, mode: chainMode, items: JSON.stringify(items) };
    try {
      if (editing) {
        await api(`/chains/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        toast("Chain updated");
      } else {
        await api("/chains", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        toast("Chain created");
      }
      setModal(false); load();
    } catch (e: any) { toast(e.message, "error"); }
  }

  async function del(c: any) {
    if (!confirm(`Delete "${c.name}"?`)) return;
    try { await api(`/chains/${c.id}`, { method: "DELETE" }); toast("Deleted"); load(); }
    catch (e: any) { toast(e.message, "error"); }
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title">Fallback Chains</div>
        <button className="btn btn-primary" onClick={() => openModal()}>+ Create Chain</button>
      </div>

      {chains.length === 0 ? (
        <div style={{ color: "var(--text-dim)", padding: 40, textAlign: "center" }}>No chains yet.</div>
      ) : (
        <div className="grid-2">
          {chains.map((c: any) => {
            let items: any[] = [];
            try { items = JSON.parse(c.items); } catch {}
            return (
              <div key={c.id} className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">{c.name}</div>
                    <div className="card-meta">Mode: {c.mode}</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                  {c.mode === "models"
                    ? (items as string[]).join(" → ")
                    : (items as any[]).map(i => `${i.provider}(${(i.models||[]).join(",")})`).join(" → ")}
                </div>
                <div className="card-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                  <button className="btn btn-sm" onClick={() => openModal(c)}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => del(c)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? "Edit Chain" : "Create Fallback Chain"} width={620}>
        <div className="form-group">
          <label>Chain Name (clients use this as model name)</label>
          <input type="text" value={chainName} onChange={e => setChainName(e.target.value)} placeholder="e.g. best-claude, auto, smart-route" />
          <div className="form-hint">Clients send <code style={{ color: "var(--green)" }}>model: &quot;your-chain-name&quot;</code> to activate this chain</div>
        </div>
        <div className="form-group">
          <label>Mode</label>
          <select value={chainMode} onChange={e => rebuildBuilder(e.target.value)}>
            <option value="models">MODELS — model-level fallback</option>
            <option value="provider">PROVIDER — provider × model matrix</option>
          </select>
        </div>
        <div className="form-group">
          <label>Fallback Priority <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(drag to reorder, toggle to enable/disable)</span></label>
          <div className="chain-builder">
            {chainMode === "models" ? (
              builderData.map((item, idx) => {
                let orderNum = 0;
                for (let i = 0; i <= idx; i++) { if (builderData[i].enabled) orderNum++; }
                return (
                  <div key={item.name} className={`chain-builder-item ${item.enabled ? "" : "disabled"}`}
                    draggable onDragStart={() => handleDragStart(idx)}
                    onDragOver={e => e.preventDefault()} onDrop={() => handleDrop(idx)}>
                    <span className="chain-builder-handle">⠿</span>
                    <span className="chain-builder-order">{item.enabled ? orderNum : "—"}</span>
                    <span className="chain-builder-name" style={{ color: item.enabled ? "var(--green)" : "var(--text-dim)" }}>{item.name}</span>
                    <div className={`chain-builder-toggle ${item.enabled ? "on" : "off"}`} onClick={() => toggleItem(idx)} />
                  </div>
                );
              })
            ) : (
              builderData.map((item, pIdx) => {
                let orderNum = 0;
                for (let i = 0; i <= pIdx; i++) { if (builderData[i].enabled) orderNum++; }
                return (
                  <div key={item.provider} className={`chain-builder-provider ${item.enabled ? "" : "disabled"}`}>
                    <div className="chain-builder-provider-header" draggable
                      onDragStart={() => handleDragStart(pIdx)}
                      onDragOver={e => e.preventDefault()} onDrop={() => handleDrop(pIdx)}>
                      <span className="chain-builder-handle">⠿</span>
                      <span className="chain-builder-order">{item.enabled ? orderNum : "—"}</span>
                      <span className="chain-builder-name" style={{ color: item.enabled ? "var(--cyan)" : "var(--text-dim)" }}>{item.provider}</span>
                      <span className="chain-builder-meta">{item.models.filter((m: any) => m.enabled).length} models</span>
                      <div className={`chain-builder-toggle ${item.enabled ? "on" : "off"}`} onClick={() => toggleItem(pIdx)} />
                    </div>
                    <div className="chain-builder-sub-list">
                      {item.models.map((m: any, mIdx: number) => (
                        <div key={m.name} className={`chain-builder-sub-item ${m.enabled ? "" : "disabled"}`}>
                          <span style={{ flex: 1, color: m.enabled ? "var(--green)" : "var(--text-dim)" }}>{m.name}</span>
                          <div className={`chain-builder-toggle ${m.enabled ? "on" : "off"}`}
                            style={{ width: 24, height: 14 }} onClick={() => toggleSubItem(pIdx, mIdx)} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
            {builderData.length === 0 && (
              <div style={{ color: "var(--text-dim)", padding: 20, textAlign: "center", fontSize: 11 }}>No models/providers available</div>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={() => setModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveChain}>Save</button>
        </div>
      </Modal>
    </div>
  );
}
