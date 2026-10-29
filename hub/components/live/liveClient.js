"use client";
// Uma única conexão SSE por aba; as telas assinam por escopo. Reconecta sozinha e avisa ("reconnect").
import { useEffect, useRef } from "react";

let es = null;
let retry = 1000;
const listeners = new Set();

function connect() {
  if (es || typeof window === "undefined") return;
  es = new EventSource("/api/live");
  es.onmessage = (m) => {
    retry = 1000;
    let evt;
    try { evt = JSON.parse(m.data); } catch { return; }
    for (const fn of listeners) { try { fn(evt); } catch {} }
  };
  es.onerror = () => {
    es?.close();
    es = null;
    setTimeout(() => { if (listeners.size) { connect(); for (const fn of listeners) { try { fn({ scope: "reconnect" }); } catch {} } } }, retry);
    retry = Math.min(retry * 2, 15000);
  };
}

export function subscribeLive(fn) {
  listeners.add(fn);
  connect();
  return () => {
    listeners.delete(fn);
    if (!listeners.size && es) { es.close(); es = null; }
  };
}

/** Executa `cb(evt)` quando algo dos escopos indicados mudar (ou ao reconectar). Sem escopos = tudo. */
export function useLive(scopes, cb) {
  const ref = useRef(cb);
  ref.current = cb;
  const key = (scopes || []).join(",");
  useEffect(() => {
    const want = key ? key.split(",") : null;
    return subscribeLive((evt) => {
      if (evt.scope === "hello") return;
      if (!want || evt.scope === "reconnect" || want.includes(evt.scope)) ref.current(evt);
    });
  }, [key]);
}
