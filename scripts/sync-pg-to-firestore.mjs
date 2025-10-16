// PG -> Firestore sync script
// Usage (PowerShell):
//   $env:PGHOST="host"; $env:PGPORT="5432"; $env:PGDATABASE="db"; $env:PGUSER="user"; $env:PGPASSWORD="pass"; \
//   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\serviceAccount.json"; \
//   node ./scripts/sync-pg-to-firestore.mjs

import pg from 'pg';
import admin from 'firebase-admin';
import fs from 'fs/promises';

process.on('unhandledRejection', (e) => {
  console.error('[sync] UnhandledRejection:', e && e.stack ? e.stack : e);
});
process.on('uncaughtException', (e) => {
  console.error('[sync] UncaughtException:', e && e.stack ? e.stack : e);
});

const {
  PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD,
  GOOGLE_APPLICATION_CREDENTIALS, PGSSL,
  PG_CONNECT_TIMEOUT, PG_STATEMENT_TIMEOUT
} = process.env;

if (!PGHOST || !PGDATABASE || !PGUSER) {
  console.error('[sync] Defina PGHOST/PGDATABASE/PGUSER (e PGPASSWORD se houver).');
  process.exit(1);
}
if (!GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('[sync] Defina GOOGLE_APPLICATION_CREDENTIALS com o caminho do service account do Firebase.');
  process.exit(1);
}

// Validate service account file exists
try {
  await fs.access(GOOGLE_APPLICATION_CREDENTIALS);
} catch {
  console.error(`[sync] Arquivo de credenciais não encontrado: ${GOOGLE_APPLICATION_CREDENTIALS}`);
  process.exit(1);
}

// Try to read project_id for logging (non-sensitive)
try {
  const sa = JSON.parse(await fs.readFile(GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  if (sa && sa.project_id) {
    console.log(`[sync] Using Firebase project_id=${sa.project_id}`);
  }
} catch {}

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

const pool = new pg.Pool({
  host: PGHOST,
  port: Number(PGPORT || 5432),
  database: PGDATABASE,
  user: PGUSER,
  password: PGPASSWORD,
  ssl: PGSSL === '1' ? { rejectUnauthorized: false } : undefined,
  // Fail fast if connection can't be established
  connectionTimeoutMillis: Number(PG_CONNECT_TIMEOUT || 10000),
  idleTimeoutMillis: 10000,
  max: 3
});

// Mapeie códigos de grupo do ERP para categorias usadas no site
const GRUPO_TO_CATEGORIA = {
  10000: 'conveniencia',   // conveniência
  9000:  'correlatos',     // correlatos
  4000:  'genericos',      // genéricos
  8000:  'perfumaria',     // perfumaria
  3000:  'referencia',     // referência
  2000:  'similares'       // similares
};
const mapCategoria = g => GRUPO_TO_CATEGORIA[g] || 'medicamentos';

function calcularPreco(vlr_venda, prc_desconto){
  const v = Number(vlr_venda)||0, d = Number(prc_desconto)||0;
  const isPercent = d > 0 && d <= 1;
  const preco = isPercent ? v * (1 - d) : Math.max(0, v - d);
  return { precoMaximo: v, precoComDesconto: +preco.toFixed(2) };
}

// ============ Blocking filters (keywords, groups, price) ============
// Load optional config from config/product-filters.json
let FILTERS = {
  disallowedKeywords: [
    'entrega', 'resto de compras', 'resto compras', 'aplicação', 'aplica', 'f2'
  ],
  disallowedGroups: [], // e.g., [ 9900, 9950 ]
  minPrice: 0.01
};
try {
  const rawCfg = await fs.readFile('config/product-filters.json','utf8');
  const cfg = JSON.parse(rawCfg);
  if (cfg && typeof cfg === 'object') FILTERS = Object.assign(FILTERS, cfg);
  console.log('[sync] product-filters loaded');
} catch {}

function removeAccents(str){
  try { return (str||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''); } catch { return (str||''); }
}
function shouldBlockProduct({ nome, cod_grupo, precoMaximo, precoComDesconto }){
  const reasons = [];
  const txt = removeAccents(String(nome||'').toLowerCase());
  const kws = Array.isArray(FILTERS.disallowedKeywords) ? FILTERS.disallowedKeywords : [];
  for (const kw of kws) {
    const normKw = removeAccents(String(kw||'').toLowerCase());
    if (normKw && txt.includes(normKw)) {
      reasons.push(`palavra:${kw}`);
    }
  }
  if (Array.isArray(FILTERS.disallowedGroups) && FILTERS.disallowedGroups.includes(Number(cod_grupo))) {
    reasons.push(`grupo:${cod_grupo}`);
  }
  const minP = Number(FILTERS.minPrice||0);
  if (!Number.isFinite(precoComDesconto) || precoComDesconto < minP) {
    reasons.push('sem_valor');
  }
  if (!Number.isFinite(precoMaximo) || precoMaximo < minP) {
    reasons.push('preco_max_zero');
  }
  return reasons;
}

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
  const sslEnabled = PGSSL === '1';
  console.log(`[sync] Connecting to PG host=${PGHOST} port=${PGPORT||5432} db=${PGDATABASE} user=${PGUSER} ssl=${sslEnabled}`);
  const client = await pool.connect();
  try {
    console.log('[sync] Connected to PG.');
    await client.query('SELECT 1');
    console.log('[sync] Heartbeat OK');
    const stmtTimeoutMs = Number(PG_STATEMENT_TIMEOUT || 15000);
    if (Number.isFinite(stmtTimeoutMs) && stmtTimeoutMs > 0) {
      await client.query(`SET statement_timeout = ${stmtTimeoutMs}`);
      console.log(`[sync] statement_timeout set to ${stmtTimeoutMs} ms`);
    }
    const schema = process.env.PGSCHEMA;
    if (schema) {
      await client.query(`SET search_path TO ${schema}`);
      console.log(`[sync] search_path set to ${schema}`);
    }
    // Optional sampling for testing: SYNC_LIMIT (number) and/or SYNC_SAMPLE_IDS (comma-separated cod_reduzido)
    const limitN = Number(process.env.SYNC_LIMIT || 0);
    const sampleIds = (process.env.SYNC_SAMPLE_IDS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => Number(s))
      .filter(n => Number.isFinite(n));

  const sampleClause = sampleIds.length ? ` AND p.cod_reduzido IN (${sampleIds.join(',')})` : '';
  const limitClause = Number.isFinite(limitN) && limitN > 0 ? ` LIMIT ${limitN}` : '';
  const orderByClause = (sampleIds.length || limitClause) ? '' : ' ORDER BY p.cod_reduzido ASC';

  console.log(`[sync] Executando SELECT com${sampleClause ? ' filtro de IDs' : ''}${limitClause ? ' e limite '+limitN : ''}${orderByClause ? ' (com ORDER BY)' : ' (sem ORDER BY)'}...`);

    console.time('[sync] SELECT');
    let rows = [];
    try {
      const res = await client.query(`
      SELECT p.cod_reduzido AS cod_red, p.nom_produto AS nome, p.cod_grupo, p.vlr_venda, p.prc_desconto,
             d.nom_dcb AS dcb, l.nom_laborat AS laboratorio, e.qtd_estoque AS quantidade
      FROM cadprodu p
      JOIN cadestoq e USING (cod_reduzido)
      LEFT JOIN cadcddcb d ON d.cod_dcb = p.cod_dcb
      LEFT JOIN cadlabor l ON l.cod_laborat = p.cod_laborat
      WHERE p.flg_ativo = 'A'
        AND (p.tip_classeterapeutica IS NULL OR NULLIF(TRIM(p.tip_classeterapeutica::text), '') IS NULL)
        AND e.qtd_estoque > 0
        ${sampleClause}
      ${orderByClause}
      ${limitClause}
      `);
      rows = res.rows;
    } catch (err) {
      console.log('[sync] SELECT error:', err && err.message ? err.message : String(err));
      throw err;
    }
    console.timeEnd('[sync] SELECT');

    if (!rows.length) {
      console.warn('[sync] Nenhum produto retornado pelo SELECT.');
    }

    const col = db.collection('produtos');
    let batch = db.batch();
    let ops = 0;

    for (const r of rows) {
      const { precoMaximo, precoComDesconto } = calcularPreco(r.vlr_venda, r.prc_desconto);
      const id = String(r.cod_red);
      const basePayload = {
        id,
        nome: r.nome,
        descricao: '',
        categoria: mapCategoria(r.cod_grupo),
        precoMaximo,
        precoComDesconto,
        desconto: (precoMaximo>0) ? Math.round((1 - (precoComDesconto / precoMaximo)) * 100) : 0,
        quantidade: Number(r.quantidade)||0,
        codRed: id,
        dcb: r.dcb || null,
        laboratorio: r.laboratorio || '',
        destaque: false,
        ativo: true,
        imagens: [],
        atualizadoEm: new Date().toISOString()
      };
      // Compute blocking reasons and moderation flags
      const reasons = shouldBlockProduct({ nome: r.nome, cod_grupo: r.cod_grupo, precoMaximo, precoComDesconto });
      const isBlocked = reasons.length > 0;
      const payload = Object.assign({}, basePayload, {
        pendente: isBlocked,
        motivosBloqueio: reasons
      });
      // Only set publicado=false when blocked to avoid overriding manual approvals
      if (isBlocked) payload.publicado = false;
      batch.set(col.doc(id), payload, { merge: true });
      ops++;

      // Commit em lotes de 400 para não estourar limites
      if (ops % 400 === 0) {
        console.log(`[sync] Committing batch at ${ops} ops...`);
        try {
          await batch.commit();
          console.log('[sync] Batch committed.');
        } catch (e) {
          console.error('[sync] Batch commit error:', e && e.message ? e.message : e);
          throw e;
        }
        batch = db.batch();
      }
    }

    if (ops % 400 !== 0) {
      console.log(`[sync] Committing final batch (${ops % 400} ops)...`);
      try {
        await batch.commit();
        console.log('[sync] Final batch committed.');
      } catch (e) {
        console.error('[sync] Final batch commit error:', e && e.message ? e.message : e);
        throw e;
      }
    }
    console.log('[sync] Bumping productsVersion...');
    try {
      await bumpProductsVersion();
      console.log('[sync] productsVersion bumped.');
    } catch (e) {
      console.error('[sync] bumpProductsVersion error:', e && e.message ? e.message : e);
      throw e;
    }

    console.log(`[sync] Sincronizados ${ops} produtos.`);
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error('[sync] Erro', err); process.exit(1); });
