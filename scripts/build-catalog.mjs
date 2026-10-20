// Gera o catálogo agregado (catalogo/parte-N) a partir da coleção `produtos`.
// O site lê só essas poucas partes em vez da coleção inteira (~10 mil leituras por visitante novo).
// Rodado automaticamente ao fim de sync-pg-to-firestore / sync-stock-only / clean-products.
// Uso manual (PowerShell):
//   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\Keys\\farmacia-service-account.json"
//   node .\\scripts\\build-catalog.mjs
// Env: DRY_RUN=1 só mostra o resultado, sem gravar.

import admin from 'firebase-admin';
import { pathToFileURL } from 'node:url';
import { buildCatalogParts, compactProduct, isVisibleProduct, CATALOG_COLLECTION } from '../modern/js/services/catalog-utils.mjs';

// Acima disso, reler a coleção inteira sai igual ou mais barato que ler produto a produto
const INCREMENTAL_MAX_CHANGED = 2000;

const partsSizes = (parts) => parts.map(p => Math.round(Buffer.byteLength(JSON.stringify(p)) / 1024) + 'KB').join(', ');

// Grava as partes e aponta meta/counters para a nova versão (sempre maior que a anterior)
async function writeCatalog(db, parts, counters, { log, t0 }) {
  const version = Math.max(Number(counters.productsVersion) || 0, (Number(counters.catalogVersion) || 0) + 1);
  const oldParts = Number(counters.catalogParts) || 0;
  const now = admin.firestore.FieldValue.serverTimestamp();
  const col = db.collection(CATALOG_COLLECTION);
  // Grava as partes primeiro e só depois aponta meta/counters para a nova versão
  for (let i = 0; i < parts.length; i++) {
    await col.doc(`parte-${i + 1}`).set({ v: version, parte: i + 1, total: parts.length, itens: parts[i], geradoEm: now });
  }
  await db.collection('meta').doc('counters').set({ catalogVersion: version, catalogParts: parts.length, catalogUpdatedAt: now }, { merge: true });
  // Remove partes que sobraram de um catálogo maior
  for (let i = parts.length + 1; i <= oldParts; i++) {
    await col.doc(`parte-${i}`).delete();
  }
  log(`[catalog] Catálogo v${version} publicado em ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
  return version;
}

async function readCounters(db) {
  const snap = await db.collection('meta').doc('counters').get();
  return snap.exists ? snap.data() : {};
}

/** Catálogo completo: relê a coleção `produtos` inteira (~1 leitura por produto). */
export async function buildCatalog(db, { dryRun = false, log = console.log } = {}) {
  const t0 = Date.now();
  const snap = await db.collection('produtos').get();
  const raw = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
  const parts = buildCatalogParts(raw);
  const total = parts.reduce((n, p) => n + p.length, 0);
  log(`[catalog] Produtos lidos: ${raw.length}; visíveis: ${total}; partes: ${parts.length} (${partsSizes(parts)})`);
  if (dryRun) return { parts: parts.length, total };
  const version = await writeCatalog(db, parts, await readCounters(db), { log, t0 });
  return { parts: parts.length, total, version };
}

/**
 * Catálogo incremental: parte do catálogo publicado e relê só os produtos alterados.
 * Custo: 1 (meta) + N partes + k produtos alterados, em vez da coleção inteira.
 * Lê os documentos alterados no Firestore para respeitar o que o admin decidiu (publicado/pendente/status).
 * Se o catálogo não existir, estiver inconsistente ou houver muitos alterados, faz o completo.
 */
export async function updateCatalogIncremental(db, changedIds, { log = console.log } = {}) {
  const t0 = Date.now();
  const ids = [...new Set((changedIds || []).map(String))];
  if (!ids.length) { log('[catalog] Nenhum produto alterado; catálogo mantido.'); return null; }
  if (ids.length > INCREMENTAL_MAX_CHANGED) {
    log(`[catalog] ${ids.length} alterados: catálogo completo é mais barato.`);
    return buildCatalog(db, { log });
  }

  const counters = await readCounters(db);
  const partsCount = Number(counters.catalogParts) || 0;
  const catalogVersion = counters.catalogVersion;
  if (!partsCount || typeof catalogVersion !== 'number') {
    log('[catalog] Catálogo ainda não existe; gerando completo.');
    return buildCatalog(db, { log });
  }
  const col = db.collection(CATALOG_COLLECTION);
  const partSnaps = await db.getAll(...Array.from({ length: partsCount }, (_, i) => col.doc(`parte-${i + 1}`)));
  if (!partSnaps.every(sn => sn.exists && sn.data().v === catalogVersion)) {
    log('[catalog] Catálogo inconsistente; gerando completo.');
    return buildCatalog(db, { log });
  }

  const byId = new Map();
  partSnaps.forEach(sn => (sn.data().itens || []).forEach(it => byId.set(String(it.id), it)));
  const before = byId.size;

  // Relê só os alterados (em lotes) e aplica: entra/atualiza se visível, sai se não
  const prodCol = db.collection('produtos');
  let added = 0, updated = 0, removed = 0;
  for (let i = 0; i < ids.length; i += 300) {
    const snaps = await db.getAll(...ids.slice(i, i + 300).map(id => prodCol.doc(id)));
    for (const sn of snaps) {
      const raw = sn.exists ? Object.assign({ id: sn.id }, sn.data()) : null;
      const had = byId.has(sn.id);
      if (raw && isVisibleProduct(raw)) {
        byId.set(sn.id, compactProduct(raw));
        had ? updated++ : added++;
      } else if (had) {
        byId.delete(sn.id);
        removed++;
      }
    }
  }

  const parts = buildCatalogParts([...byId.values()]);
  const total = parts.reduce((n, p) => n + p.length, 0);
  log(`[catalog] Incremental: ${ids.length} alterados lidos (+${added} novos, ${updated} atualizados, -${removed} removidos); visíveis: ${before} → ${total}; partes: ${parts.length} (${partsSizes(parts)}); leituras: ${1 + partsCount + ids.length}`);
  const version = await writeCatalog(db, parts, counters, { log, t0 });
  return { parts: parts.length, total, version };
}

// Execução direta: node scripts/build-catalog.mjs
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('[catalog] Defina GOOGLE_APPLICATION_CREDENTIALS com o caminho do service account do Firebase.');
    process.exit(1);
  }
  try { admin.initializeApp({ credential: admin.credential.applicationDefault() }); } catch {}
  buildCatalog(admin.firestore(), { dryRun: process.env.DRY_RUN === '1' })
    .catch(err => { console.error('[catalog] Erro', err); process.exit(1); });
}
