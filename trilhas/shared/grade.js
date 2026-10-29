// Correção de exercícios SQL — roda igual no navegador e no Node (validação das trilhas).
// `SQL` é o módulo retornado por initSqlJs().

export function openDb(SQL, step, dataset) {
  const db = new SQL.Database();
  if (step.dataset !== false && dataset) db.exec(dataset);
  if (step.setup) db.exec(step.setup);
  return db;
}

function lastResult(results) {
  return results.length ? results[results.length - 1] : null;
}

function norm(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(Math.round(v * 1e6) / 1e6);
  return String(v);
}

function rowsOf(res) {
  return res ? res.values.map((r) => r.map(norm)) : [];
}

export function sameResult(a, b, { ordered = false, names = false } = {}) {
  if (!a && !b) return { ok: true };
  if (!a || !b) return { ok: false, reason: 'A consulta não devolveu uma tabela de resultado.' };
  if (a.columns.length !== b.columns.length) {
    return { ok: false, reason: `Esperava ${b.columns.length} coluna(s), mas sua consulta devolveu ${a.columns.length}.` };
  }
  if (names) {
    const an = a.columns.map((c) => c.toLowerCase());
    const bn = b.columns.map((c) => c.toLowerCase());
    if (an.join('|') !== bn.join('|')) {
      return { ok: false, reason: `Os nomes das colunas deveriam ser: ${b.columns.join(', ')}.` };
    }
  }
  let ra = rowsOf(a).map((r) => JSON.stringify(r));
  let rb = rowsOf(b).map((r) => JSON.stringify(r));
  if (ra.length !== rb.length) {
    return { ok: false, reason: `Esperava ${rb.length} linha(s), mas sua consulta devolveu ${ra.length}.` };
  }
  if (!ordered) {
    ra = ra.slice().sort();
    rb = rb.slice().sort();
  }
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) {
      return { ok: false, reason: ordered ? 'As linhas estão diferentes ou fora de ordem.' : 'Os valores devolvidos estão diferentes do esperado.' };
    }
  }
  return { ok: true };
}

// Executa o SQL do aluno e compara com a solução do passo.
export function gradeQuery(SQL, step, dataset, userSql) {
  let db1, db2;
  const out = { ok: false, error: null, result: null, reason: null };
  try {
    db1 = openDb(SQL, step, dataset);
    let results;
    try {
      results = db1.exec(userSql);
    } catch (e) {
      out.error = String(e.message || e);
      return out;
    }
    out.result = lastResult(results);

    if (step.must && !new RegExp(step.must, 'i').test(userSql)) {
      out.reason = step.mustMsg || 'Use o comando pedido no enunciado.';
      return out;
    }

    db2 = openDb(SQL, step, dataset);
    const expectedAll = db2.exec(step.solution);
    let a = lastResult(results);
    let b = lastResult(expectedAll);
    if (step.verify) {
      a = lastResult(db1.exec(step.verify));
      b = lastResult(db2.exec(step.verify));
    }
    const cmp = sameResult(a, b, { ordered: !!step.ordered, names: !!step.names });
    out.ok = cmp.ok;
    out.reason = cmp.reason || null;
    return out;
  } catch (e) {
    out.error = String(e.message || e);
    return out;
  } finally {
    if (db1) db1.close();
    if (db2) db2.close();
  }
}
