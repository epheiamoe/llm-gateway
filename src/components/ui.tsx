"use client";

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from "react";

// --- Toast ---
type ToastType = "success" | "error";
interface Toast { id: number; message: string; type: ToastType }
let toastId = 0;
let toastSetter: ((t: Toast[]) => void) | null = null;
let toastList: Toast[] = [];

export function toast(message: string, type: ToastType = "success") {
  const t: Toast = { id: ++toastId, message, type };
  toastList = [...toastList, t];
  toastSetter?.(toastList);
  setTimeout(() => { toastList = toastList.filter(x => x.id !== t.id); toastSetter?.(toastList); }, 3000);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => { toastSetter = setToasts; return () => { toastSetter = null; }; }, []);
  if (!toasts.length) return null;
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
      ))}
    </div>
  );
}

// --- API helper ---
const API = "/api";
export async function api(path: string, opts?: RequestInit) {
  const res = await fetch(API + path, opts);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// --- Refresh context ---
interface RefreshCtx { tick: number; refresh: () => void }
const RefreshContext = createContext<RefreshCtx>({ tick: 0, refresh: () => {} });
export function RefreshProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);
  return <RefreshContext.Provider value={{ tick, refresh }}>{children}</RefreshContext.Provider>;
}
export function useRefresh() { return useContext(RefreshContext); }

// --- Modal ---
export function Modal({ open, onClose, title, width, children }: {
  open: boolean; onClose: () => void; title: string; width?: number; children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={width ? { width } : undefined}>
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>
  );
}

// --- Confirm ---
export function useConfirm() {
  return (msg: string) => window.confirm(msg);
}

// --- Escape HTML (for display) ---
export function esc(s: string | null | undefined) {
  return s || "";
}
