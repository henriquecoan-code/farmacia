// Atualiza apenas o estoque (quantidade) dos produtos no Firestore a partir do PostgreSQL
// Uso (PowerShell):
//   $env:PGHOST=...; $env:PGDATABASE=...; $env:PGUSER=...; $env:PGPASSWORD=...;
//   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\Keys\\farmacia-service-account.json";
//   node .\\scripts\\sync-stock-only.mjs
// Compara com o estado local (scripts/.state/produtos-sync.json): 0 leituras no Firestore para
// decidir o que mudou; grava só os alterados. FORCE_READ=1 volta a ler cada documento no Firestore.

import pg from 'pg';
import admin from 'firebase-admin';
import { updateCatalogIncremental } from './build-catalog.mjs';
import { loadOrRebuildState, saveState } from './sync-state.mjs';

process.on('unhandledRejection', (e) => {
  console.error('[stock-sync] UnhandledRejection:', e && e.stack ? e.stack : e);
});
process.on('uncaughtException', (e) => {
  console.error('[stock-sync] UncaughtException:', e && e.stack ? e.stack : e);
});

const {
  PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD,
  GOOGLE_APPLICATION_CREDENTIALS, PGSSL,
  PG_CONNECT_TIMEOUT, PG_STATEMENT_TIMEOUT
} = process.env;

if (!PGHOST || !PGDATABASE || !PGUSER) {
  console.error('[stock-sync] Defina PGHOST/PGDATABASE/PGUSER (e PGPASSWORD se houver).');
  process.exit(1);
}
if (!GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('[stock-sync] Defina GOOGLE_APPLICATION_CREDENTIALS com o caminho do service account do Firebase.');
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

async function bumpProductsVersion(){
  const ref = db.collection('meta').doc('counters');
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const curr = snap.exists ? (snap.data().productsVersion || 0) : 0;
    tx.set(ref, {
      productsVersion: curr + 1,
      productsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });
}

async function main(){
  const client = await pool.connect();
  try {
    console.log(`[stock-sync] Connecting to PG host=${PGHOST} port=${PGPORT||5432} db=${PGDATABASE} user=${PGUSER} ssl=${PGSSL==='1'}`);
    await client.query('SELECT 1');
    const stmtTimeoutMs = Number(PG_STATEMENT_TIMEOUT || 15000);
    if (Number.isFinite(stmtTimeoutMs) && stmtTimeoutMs > 0) {
      await client.query(`SET statement_timeout = ${stmtTimeoutMs}`);
      console.log(`[stock-sync] statement_timeout set to ${stmtTimeoutMs} ms`);
    }
    const schema = process.env.PGSCHEMA;
    if (schema) {
      await client.query(`SET search_path TO ${schema}`);
      console.log(`[stock-sync] search_path set to ${schema}`);
    }

    const filialCod = Number(process.env.ESTOQUE_COD_FILIAL || 3);
    if (!Number.isFinite(filialCod)) {
      throw new Error(`[stock-sync] ESTOQUE_COD_FILIAL inválido: ${process.env.ESTOQUE_COD_FILIAL}`);
    }

    const limitN = Number(process.env.SYNC_LIMIT || 0);
    const sampleIds = (process.env.SYNC_SAMPLE_IDS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => Number(s))
      .filter(n => Number.isFinite(n));

    const sampleClause = sampleIds.length ? ` AND p.cod_reduzido IN (${sampleIds.join(',')})` : '';
    const limitClause = Number.isFinite(limitN) && limitN > 0 ? ` LIMIT ${limitN}` : '';

    console.log(`[stock-sync] Executando SELECT de estoque (filial=${filialCod})${sampleClause ? ' com filtro de IDs' : ''}${limitClause ? ' e limite '+limitN : ''}...`);
    console.time('[stock-sync] SELECT');
    const res = await client.query(`
      SELECT p.cod_reduzido AS cod_red, COALESCE(e.qtd_estoque, 0) AS quantidade
      FROM cadprodu p
      LEFT JOIN cadestoq e
        ON e.cod_reduzido = p.cod_reduzido
       AND e.cod_filial = ${filialCod}
      WHERE p.flg_ativo = 'A'
        AND (p.tip_classeterapeutica IS NULL OR NULLIF(TRIM(p.tip_classeterapeutica::text), '') IS NULL)
        ${sampleClause}
      ${limitClause}
    `);
    console.timeEnd('[stock-sync] SELECT');

  const col = db.collection('produtos');
  const VERBOSE = process.env.VERBOSE === '1';
  const DRY_RUN = process.env.DRY_RUN === '1';
  const FORCE_READ = process.env.FORCE_READ === '1';
  // Não cria produtos novos (isso é do sync completo); ONLY_EXISTING=0 desliga
  const ONLY_EXISTING = process.env.ONLY_EXISTING !== '0';
  const PROGRESS_EVERY = Number(process.env.PROGRESS_EVERY || 1000);
  const t0 = Date.now();
  let firestoreReads = 0;

  // Estado local = o que já está no Firestore (reconstrói uma vez se não existir)
  const state = FORCE_READ ? { versao: 1, itens: {} } : await loadOrRebuildState(db);

  // 1) Decide o que mudou comparando com o estado (ou lendo o Firestore com FORCE_READ=1)
  const toWrite = [];
  let skippedSame = 0;
  let notFound = 0;
  let processed = 0;
  for (const r of res.rows) {
    const id = String(r.cod_red);
    const quantidade = Number(r.quantidade) || 0;
    let prev;
    let exists;
    if (FORCE_READ) {
      const snap = await col.doc(id).get();
      firestoreReads++;
      exists = snap.exists;
      prev = exists ? (Number(snap.get('quantidade')) || 0) : undefined;
    } else {
      const st = state.itens[id];
      exists = !!st;
      prev = st ? st.q : undefined;
    }
    let write = false;
    if (!exists && ONLY_EXISTING) notFound++;
    else if (prev === quantidade) skippedSame++;
    else { toWrite.push({ id, quantidade }); write = true; }
    if (VERBOSE) console.log(`[stock-sync] id=${id} prev=${prev ?? '?'} -> new=${quantidade} ${write ? '(write)' : '(skip)'}`);
    processed++;
    if (PROGRESS_EVERY > 0 && processed % PROGRESS_EVERY === 0) console.log(`[stock-sync] comparados: ${processed}/${res.rows.length}`);
  }
  console.log(`[stock-sync] A gravar: ${toWrite.length}; iguais: ${skippedSame}; fora do Firestore: ${notFound}; leituras Firestore: ${firestoreReads}${DRY_RUN ? ' [DRY_RUN]' : ''}`);

  // 2) Grava só os alterados, em lotes; `update` não recria produto apagado no Firestore
  const written = [];
  const missing = [];
  if (!DRY_RUN) {
    for (let i = 0; i < toWrite.length; i += 400) {
      const chunk = toWrite.slice(i, i + 400);
      const now = new Date().toISOString();
      const batch = db.batch();
      chunk.forEach(it => batch.update(col.doc(it.id), { quantidade: it.quantidade, atualizadoEm: now }));
      const ok = [];
      try {
        await batch.commit();
        ok.push(...chunk);
      } catch (e) {
        if (!e || e.code !== 5) throw e; // 5 = NOT_FOUND: algum produto foi apagado; grava um a um
        for (const it of chunk) {
          try { await col.doc(it.id).update({ quantidade: it.quantidade, atualizadoEm: now }); ok.push(it); }
          catch (err) { if (err && err.code === 5) missing.push(it.id); else throw err; }
        }
      }
      written.push(...ok);
      // Atualiza o estado só depois do lote confirmado (se cair no meio, o próximo sync refaz o resto)
      if (!FORCE_READ) {
        ok.forEach(it => { if (state.itens[it.id]) state.itens[it.id].q = it.quantidade; else state.itens[it.id] = { h: null, q: it.quantidade }; });
        missing.forEach(id => { delete state.itens[id]; });
        await saveState(state);
      }
      console.log(`[stock-sync] Gravados ${written.length}/${toWrite.length}...`);
    }
  }

  if (!DRY_RUN && written.length > 0 && process.env.BUMP_VERSION !== '0') {
    console.log('[stock-sync] Bumping productsVersion...');
    await bumpProductsVersion();
    // Atualiza o catálogo agregado lido pelo site só com os produtos alterados
    await updateCatalogIncremental(db, written.map(it => it.id));
  }

  const dt = (Date.now() - t0) / 1000;
  console.log(`[stock-sync] Itens PG lidos: ${res.rows.length}; alterados: ${written.length}${DRY_RUN ? ` (simulados: ${toWrite.length})` : ''}; iguais/skip: ${skippedSame}; fora do Firestore: ${notFound}; apagados no Firestore: ${missing.length}; leituras Firestore p/ comparar: ${firestoreReads}${DRY_RUN ? ' [DRY_RUN]' : ''}; tempo: ${dt.toFixed(1)}s.`);
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error('[stock-sync] Erro', err); process.exit(1); });
