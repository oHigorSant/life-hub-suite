// Erros padronizados dos motores. `kind` decide o que o roteador faz (esfriar, trocar de chave/motor, desistir).
//   quota-daily   cota do dia esgotada        -> esfria até a renovação
//   quota-minute  limite por minuto           -> esfria alguns segundos, tenta o próximo
//   auth          chave inválida/sem permissão -> esfria 1 h (e avisa no painel)
//   credits       sem créditos (OpenRouter)    -> esfria 30 min
//   bad-model     modelo indisponível          -> esfria 6 h
//   overloaded    instabilidade do serviço     -> esfria 1 min
//   network       sem rede/tempo esgotado      -> esfria 1 min
//   steps         passos esgotados             -> sem esfriar
//   other         qualquer outro               -> esfria 30 s
export class EngineError extends Error {
  constructor(kind, message, { retryAfterMs = 0, until = 0, slot = null, status = null } = {}) {
    super(message);
    this.kind = kind; this.retryAfterMs = retryAfterMs; this.until = until; this.slot = slot; this.status = status;
  }
}

const MIN = 60_000;
export function cooldownMs(err) {
  switch (err.kind) {
    case "quota-minute": return Math.min(Math.max(err.retryAfterMs || 30_000, 5_000), 5 * MIN);
    case "overloaded": case "network": return MIN;
    case "auth": return 60 * MIN;
    case "credits": return 30 * MIN;
    case "bad-model": return 6 * 60 * MIN;
    case "steps": return 0;
    default: return 30_000;
  }
}
