import initSqlJs from 'sql.js/dist/sql-wasm.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { gradeQuery, openDb } from '../shared/grade.js';

let sqlPromise;
export const getSQL = () => (sqlPromise ||= initSqlJs({ locateFile: () => wasmUrl }));

const schemaCache = new Map();

// Lista as tabelas do dataset da trilha (para o painel "Banco de dados").
export async function getSchema(trackId, dataset, step) {
  const key = `${trackId}:${step?.dataset === false ? 'x' : 'd'}:${step?.setup || ''}`;
  if (schemaCache.has(key)) return schemaCache.get(key);
  const SQL = await getSQL();
  const db = openDb(SQL, step || {}, dataset);
  const tables = [];
  const names = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid");
  for (const [name] of names[0]?.values || []) {
    const cols = db.exec(`PRAGMA table_info(${name})`)[0].values.map((r) => ({ name: r[1], type: r[2], pk: !!r[5] }));
    const sample = db.exec(`SELECT * FROM ${name} LIMIT 3`)[0];
    const count = db.exec(`SELECT COUNT(*) FROM ${name}`)[0].values[0][0];
    tables.push({ name, cols, count, sample });
  }
  db.close();
  schemaCache.set(key, tables);
  return tables;
}

// Resultado que a solução oficial produz (ou, em exercícios que alteram dados, o estado conferido em `verify`).
// É mostrado ao aluno ANTES de ele escrever: ele vê onde quer chegar.
export async function expectedFor(step, dataset) {
  const SQL = await getSQL();
  const db = openDb(SQL, step, dataset);
  try {
    const res = db.exec(step.solution);
    let r = res.length ? res[res.length - 1] : null;
    if (step.verify) {
      const v = db.exec(step.verify);
      if (v.length) r = v[v.length - 1];
    }
    return r;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

// Tabelas do banco citadas no exercício (com as primeiras linhas), para mostrar os dados com que ele trabalha.
export async function tablesUsed(trackId, step, dataset, max = 2) {
  const tables = await getSchema(trackId, dataset, step);
  const text = `${step.solution} ${step.starter || ''} ${step.prompt || ''}`;
  return tables.filter((t) => new RegExp(`\\b${t.name}\\b`, 'i').test(text)).slice(0, max);
}

export async function runPreview(step, dataset, sql) {
  const SQL = await getSQL();
  const db = openDb(SQL, step, dataset);
  try {
    const res = db.exec(sql);
    return { result: res.length ? res[res.length - 1] : null, error: null };
  } catch (e) {
    return { result: null, error: String(e.message || e) };
  } finally {
    db.close();
  }
}

export async function grade(step, dataset, sql) {
  const SQL = await getSQL();
  return gradeQuery(SQL, step, dataset, sql);
}

/* ---------- Laboratório: banco "vivo" (alterações persistem até restaurar) ---------- */
export async function labOpen(dataset) {
  const SQL = await getSQL();
  const db = new SQL.Database();
  if (dataset) db.exec(dataset);
  return db;
}

export function labExec(db, sql) {
  try {
    const results = db.exec(sql);
    return { results, error: null, changes: db.getRowsModified() };
  } catch (e) {
    return { results: [], error: String(e.message || e), changes: 0 };
  }
}

export function labSchema(db) {
  const names = db.exec("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY rowid");
  return (names[0]?.values || []).map(([name, type]) => {
    const cols = db.exec(`PRAGMA table_info(${name})`)[0]?.values.map((r) => ({ name: r[1], type: r[2], pk: !!r[5] })) || [];
    const count = db.exec(`SELECT COUNT(*) FROM ${name}`)[0]?.values[0][0] ?? 0;
    return { name, type, cols, count };
  });
}