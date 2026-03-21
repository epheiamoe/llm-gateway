"use client";

import { useState, useEffect } from "react";
import { api, Modal } from "@/components/ui";

export default function Logs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [filterModel, setFilterModel] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterProvider, setFilterProvider] = useState("");
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<any>(null);
  const limit = 50;

  useEffect(() => { load(); }, [filterModel, filterStatus, filterProvider, offset]);
  useEffect(() => {
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [filterModel, filterStatus, filterProvider, offset]);

  async function load() {
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (filterModel) params.set("model", filterModel);
      if (filterStatus) params.set("status", filterStatus);
      if (filterProvider) params.set("provider", filterProvider);
      const data = await api(`/logs?${params}`);
      setLogs(Array.isArray(data) ? data : data.logs || []);
      setTotal(data.total || (Array.isArray(data) ? data.length : 0));
    } catch {}
  }

  function statusColor(s: number) {
    if (s >= 200 && s < 300) return "var(--green)";
    if (s >= 400 && s < 500) return "var(--amber)";
    return "var(--red)";
  }

  function statusClass(s: number) {
    if (s >= 200 && s < 300) return "s-ok";
    if (s >= 400 && s < 500) return "s-warn";
    return "s-err";
  }

  return (
    <div>
      <div className="section-header">
        <div>
          <span className="section-title">Request Logs</span>
          <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 12 }}>{total} total</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input type="text" placeholder="Model..." value={filterModel} onChange={e => { setFilterModel(e.target.value); setOffset(0); }}
          style={{ width: 160, padding: "6px 10px", fontSize: 11 }} />
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setOffset(0); }}
          style={{ width: 120, padding: "6px 10px", fontSize: 11 }}>
          <option value="">All Status</option>
          <option value="200">200 OK</option>
          <option value="400">400</option>
          <option value="401">401</option>
          <option value="429">429</option>
          <option value="500">500</option>
          <option value="502">502</option>
        </select>
        <input type="text" placeholder="Provider..." value={filterProvider} onChange={e => { setFilterProvider(e.target.value); setOffset(0); }}
          style={{ width: 160, padding: "6px 10px", fontSize: 11 }} />
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="log-table">
          <thead>
            <tr><th>Time</th><th>Model</th><th>Provider</th><th>Status</th><th>Latency</th><th>Tokens</th><th>Error</th></tr>
          </thead>
          <tbody>
            {logs.map((l: any) => (
              <tr key={l.id} onClick={() => setDetail(l)} style={{ cursor: "pointer" }}>
                <td style={{ fontSize: 10, color: "var(--text-dim)" }}>{new Date(l.createdAt).toLocaleString()}</td>
                <td style={{ color: "var(--green)" }}>{l.model}</td>
                <td style={{ color: "var(--cyan)" }}>{l.providerName || "-"}</td>
                <td style={{ color: statusColor(l.status), fontWeight: 700 }}>{l.status}</td>
                <td>{l.latencyMs}ms</td>
                <td>{l.totalTokens || "-"}</td>
                <td style={{ color: "var(--red)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {l.error || ""}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--text-dim)", padding: 40 }}>No logs</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {total > limit && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
          <button className="btn btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>← Prev</button>
          <span style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: "28px" }}>
            {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          <button className="btn btn-sm" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>Next →</button>
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Request Detail" width={600}>
        {detail && (
          <div className="log-detail">
            <div className="log-detail-row">
              <div className="log-detail-label">Status</div>
              <div className="log-detail-value">
                <span className={`log-detail-status ${statusClass(detail.status)}`}>{detail.status}</span>
              </div>
            </div>
            <div className="log-detail-row"><div className="log-detail-label">Model</div><div className="log-detail-value">{detail.model}</div></div>
            <div className="log-detail-row"><div className="log-detail-label">Provider</div><div className="log-detail-value">{detail.providerName || "-"}</div></div>
            <div className="log-detail-row"><div className="log-detail-label">Deployment</div><div className="log-detail-value">{detail.deploymentId || "-"}</div></div>
            <div className="log-detail-row"><div className="log-detail-label">Latency</div><div className="log-detail-value">{detail.latencyMs}ms</div></div>
            <div className="log-detail-row"><div className="log-detail-label">Tokens</div><div className="log-detail-value">{detail.totalTokens || "-"}</div></div>
            <div className="log-detail-row"><div className="log-detail-label">Time</div><div className="log-detail-value">{new Date(detail.createdAt).toLocaleString()}</div></div>
            {detail.error && <div className="log-detail-error">{detail.error}</div>}
            {!detail.error && detail.status >= 200 && detail.status < 300 && (
              <div className="log-detail-success">Request completed successfully</div>
            )}
          </div>
        )}
        <div className="modal-actions"><button className="btn" onClick={() => setDetail(null)}>Close</button></div>
      </Modal>
    </div>
  );
}
