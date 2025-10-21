// Verifica divergências de estoque entre PG e Firestore para um conjunto pequeno de itens
// Uso (PowerShell):
//   $env:PGHOST=...; $env:PGDATABASE=...; $env:PGUSER=...; $env:PGPASSWORD=...;
//   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\Keys\\farmacia-service-account.json";
//   $env:SYNC_LIMIT="10"; # ou $env:SYNC_SAMPLE_IDS="41609,41597"
//   node .\\scripts\\verify-stock.mjs

import pg from 'pg';
import admin from 'firebase-admin';

process.on('unhandledRejection', (e) => {
  console.error('[verify] UnhandledRejection:', e && e.stack ? e.stack : e);
});
process.on('uncaughtException', (e) => {
  console.error('[verify] UncaughtException:', e && e.stack ? e.stack : e);
});

const { PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD, PGSSL, PG_CONNECT_TIMEOUT, PG_STATEMENT_TIMEOUT } = process.env;
if (!PGHOST || !PGDATABASE || !PGUSER) {
  console.error('[verify] Defina PGHOST/PGDATABASE/PGUSER (e PGPASSWORD se houver).');
  process.exit(1);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('[verify] Defina GOOGLE_APPLICATION_CREDENTIALS.');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

const pool = new pg.Pool({
  host: PGHOST,
  port: Number(PGPORT || 5432),
  database: PGDATABASE,
  user: PGUSER,
  password: PGPASSWORD,
  ssl: PGSSL === '1' ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: Number(PG_CONNECT_TIMEOUT || 10000),
  idleTimeoutMillis: 10000,
  max: 3
});

async function main(){
  const client = await pool.connect();
  try {
    const stmtTimeoutMs = Number(PG_STATEMENT_TIMEOUT || 15000);
    if (Number.isFinite(stmtTimeoutMs) && stmtTimeoutMs > 0) {
      await client.query(`SET statement_timeout = ${stmtTimeoutMs}`);
    }
    const schema = process.env.PGSCHEMA;
    if (schema) await client.query(`SET search_path TO ${schema}`);

    const filialCod = Number(process.env.ESTOQUE_COD_FILIAL || 3);
    const limitN = Number(process.env.SYNC_LIMIT || 10);
    const sampleIds = (process.env.SYNC_SAMPLE_IDS || '')
      .split(',').map(s=>s.trim()).filter(Boolean).map(Number).filter(Number.isFinite);

    const sampleClause = sampleIds.length ? ` AND p.cod_reduzido IN (${sampleIds.join(',')})` : '';
    const limitClause = Number.isFinite(limitN) && limitN > 0 ? ` LIMIT ${limitN}` : '';

    console.log(`[verify] Consultando PG (filial=${filialCod})...`);
    const res = await client.query(`
      SELECT p.cod_reduzido AS cod_red, e.qtd_estoque AS quantidade
      FROM cadprodu p
      JOIN cadestoq e ON e.cod_reduzido = p.cod_reduzido AND e.cod_filial = ${filialCod}
      WHERE p.flg_ativo = 'A'
        AND (p.tip_classeterapeutica IS NULL OR NULLIF(TRIM(p.tip_classeterapeutica::text), '') IS NULL)
        AND e.qtd_estoque >= 0
        ${sampleClause}
      ${limitClause}
    `);

    let diffs = 0, total = 0;
    for (const r of res.rows) {
      total++;
      const id = String(r.cod_red);
      const pgQty = Number(r.quantidade)||0;
      const snap = await db.collection('produtos').doc(id).get();
      const fsQty = snap.exists ? (Number(snap.get('quantidade'))||0) : null;
      const status = (fsQty === null) ? 'FS_NOT_FOUND' : (fsQty === pgQty ? 'OK' : 'DIFF');
      if (status === 'DIFF') diffs++;
      console.log(`[verify] id=${id} pg=${pgQty} fs=${fsQty} -> ${status}`);
    }

    console.log(`[verify] Total verificados: ${total}, divergências: ${diffs}`);
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error('[verify] Erro', err); process.exit(1); });
