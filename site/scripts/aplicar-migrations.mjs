// Aplica site/supabase/migrations/*.sql no Supabase, em ordem, uma vez cada (registra em public._migrations).
// Uso: powershell -ExecutionPolicy Bypass -File .\site\scripts\run-aplicar-migrations.ps1   (na raiz do projeto)
import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

const url = process.env.SUPABASE_DB_URL;
if (!url) { console.error('[migrations] Defina SUPABASE_DB_URL.'); process.exit(1); }
const ssl = process.env.SUPABASE_DB_CA
  ? { ca: readFileSync(process.env.SUPABASE_DB_CA, 'utf8'), rejectUnauthorized: true }
  : { rejectUnauthorized: false };

const dir = new URL('../supabase/migrations/', import.meta.url);
const files = (await readdir(dir)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
const db = new pg.Client({ connectionString: url, ssl });
await db.connect();
try {
  await db.query(`create table if not exists public._migrations (nome text primary key, aplicada_em timestamptz default now())`);
  await db.query(`alter table public._migrations enable row level security`); // sem políticas = ninguém do navegador lê
  const feitas = new Set((await db.query('select nome from public._migrations')).rows.map((r) => r.nome));
  for (const f of files) {
    if (feitas.has(f)) { console.log(`[migrations] já aplicada: ${f}`); continue; }
    const sql = await readFile(new URL(f, dir), 'utf8');
    await db.query('begin');
    try {
      await db.query(sql);
      await db.query('insert into public._migrations (nome) values ($1)', [f]);
      await db.query('commit');
      console.log(`[migrations] aplicada: ${f}`);
    } catch (e) {
      await db.query('rollback');
      console.error(`[migrations] ERRO em ${f}: ${e.message}`);
      process.exitCode = 1;
      break;
    }
  }
} finally {
  await db.end();
}
