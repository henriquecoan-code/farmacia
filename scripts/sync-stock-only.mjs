// Atualiza apenas o estoque (quantidade) dos produtos no Firestore a partir do PostgreSQL
// Uso (PowerShell):
//   $env:PGHOST=...; $env:PGDATABASE=...; $env:PGUSER=...; $env:PGPASSWORD=...;
//   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\Keys\\farmacia-service-account.json";
//   node .\\scripts\\sync-stock-only.mjs

import pg from 'pg';
import admin from 'firebase-admin';

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
  let batch = db.batch();
  let ops = 0;
  let changed = 0;
  let skippedSame = 0;
  let notFound = 0;
  let candidates = 0;
  const VERBOSE = process.env.VERBOSE === '1';
  const DRY_RUN = process.env.DRY_RUN === '1';
  const PROGRESS_EVERY = Number(process.env.PROGRESS_EVERY || 1000);
  const totalRows = res.rows.length;
  const t0 = Date.now();
  let processed = 0;

    for (const r of res.rows) {
      const id = String(r.cod_red);
      const quantidade = Number(r.quantidade)||0;
      const ref = col.doc(id);

      // optional reads to avoid unnecessary writes and avoid creating new docs
      // If SKIP_UNCHANGED=1 -> skip write when quantidade não mudou
      // If ONLY_EXISTING=1 -> só atualiza docs que já existem no Firestore
      let shouldWrite = true;
      let prev = undefined;
      const needRead = (process.env.SKIP_UNCHANGED === '1') || (process.env.ONLY_EXISTING === '1') || VERBOSE;
      if (needRead) {
        try {
          const snap = await ref.get();
          if (!snap.exists && process.env.ONLY_EXISTING === '1') {
            shouldWrite = false; // não criar novos docs
            notFound++;
          } else if (snap.exists && process.env.SKIP_UNCHANGED === '1') {
            prev = Number(snap.get('quantidade')) || 0;
            if (prev === quantidade) {
              shouldWrite = false;
              skippedSame++;
            }
          } else if (snap.exists) {
            prev = Number(snap.get('quantidade')) || 0;
          }
        } catch {}
      }

      if (VERBOSE) {
        if (prev === undefined) {
          console.log(`[stock-sync] id=${id} prev=? -> new=${quantidade} ${shouldWrite ? '(write)' : '(skip)'}`);
        } else {
          console.log(`[stock-sync] id=${id} prev=${prev} -> new=${quantidade} ${shouldWrite ? '(write)' : '(skip)'}`);
        }
      }

      if (!shouldWrite) {
        processed++;
        if (PROGRESS_EVERY > 0 && processed % PROGRESS_EVERY === 0) {
          const dt = (Date.now() - t0) / 1000;
          const rate = processed / Math.max(dt, 0.001);
          const eta = totalRows > 0 ? Math.max(((totalRows - processed) / Math.max(rate, 0.001)), 0) : 0;
          console.log(`[stock-sync] progress: ${processed}/${totalRows} ~ ${rate.toFixed(1)} it/s, ETA ~ ${eta.toFixed(1)}s`);
        }
        continue;
      }

      candidates++;
      if (DRY_RUN) continue; // não grava nada em dry-run

      batch.set(ref, {
        quantidade,
        atualizadoEm: new Date().toISOString()
      }, { merge: true });
      ops++;
      changed++;

      processed++;
      if (PROGRESS_EVERY > 0 && processed % PROGRESS_EVERY === 0) {
        const dt = (Date.now() - t0) / 1000;
        const rate = processed / Math.max(dt, 0.001);
        const eta = totalRows > 0 ? Math.max(((totalRows - processed) / Math.max(rate, 0.001)), 0) : 0;
        console.log(`[stock-sync] progress: ${processed}/${totalRows} ~ ${rate.toFixed(1)} it/s, ETA ~ ${eta.toFixed(1)}s`);
      }

      if (ops % 400 === 0) {
        console.log(`[stock-sync] Committing batch at ${ops} ops...`);
        await batch.commit();
        batch = db.batch();
      }
    }

    if (!DRY_RUN && ops % 400 !== 0) {
      console.log(`[stock-sync] Committing final batch (${ops % 400} ops)...`);
      await batch.commit();
    }

    if (!DRY_RUN && changed > 0 && process.env.BUMP_VERSION !== '0') {
      console.log('[stock-sync] Bumping productsVersion...');
      await bumpProductsVersion();
    }

  const dt = (Date.now() - t0) / 1000;
  console.log(`[stock-sync] Itens PG lidos: ${res.rows.length}; candidatos a mudança: ${candidates}; alterados: ${changed}; iguais/skip: ${skippedSame}; não encontrados (somente existentes): ${notFound}; commits: ${ops}${DRY_RUN ? ' [DRY_RUN]' : ''}; tempo: ${dt.toFixed(1)}s.`);
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error('[stock-sync] Erro', err); process.exit(1); });
