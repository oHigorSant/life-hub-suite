"use client";

import { useRef, useState } from "react";
import "./login.css";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const inputRef = useRef(null);

  async function submit(e) {
    e.preventDefault();
    // Lê direto do campo, não do estado: preenchimento automático (gerenciador
    // de senha, autofill do navegador/celular) escreve no input sem disparar o
    // onChange que o React escuta, então o estado pode estar vazio mesmo com o
    // campo preenchido.
    const valor = inputRef.current?.value ?? password;
    if (sending || !valor) {
      setError("Digite a senha.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: valor }),
      });
      if (res.ok) {
        const next = new URLSearchParams(window.location.search).get("next") || "/";
        window.location.href = next;
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Não foi possível entrar.");
    } catch (err) {
      setError(`Falha de rede: ${err.message}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="login-title">Life Hub</div>
        <div className="login-subtitle">Acesso restrito</div>
        <input
          ref={inputRef}
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          autoFocus
          placeholder="Senha"
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="login-error">{error}</div>}
        {/* Só desabilita enquanto envia — nunca por estado "vazio", que o
            autofill deixa dessincronizado do campo real. */}
        <button type="submit" disabled={sending}>
          {sending ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
