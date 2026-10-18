// Gera o catálogo agregado (catalogo/parte-N) a partir da coleção `produtos`.
// O site lê só essas poucas partes em vez da coleção inteira (~10 mil leituras por visitante novo).
// Rodado automaticamente ao fim de sync-pg-to-firestore / sync-stock-only / clean-products.
// Uso manual (PowerShell):
//   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\Keys\\farmacia-service-account.json"
//   node .\\scripts\\build-catalog.mjs
// Env: DRY_RUN=1 só mostra o resultado, sem gravar.

import admin from 'firebase-admin';
import { pathToFileURL } from 'node:url';
import { buildCatalogParts, CATALOG_COLLECTION } from '../modern/js/services/catalog-utils.mjs';

export async function buildCatalog(db, { dryRun = false, log = console.log } = {}) {
  const t0 = Date.now();
  const snap = await db.collection('produtos').get();
  const raw = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
  const parts = buildCatalogParts(raw);
  const total = parts.reduce((n, p) => n + p.length, 0);
  log(`[catalog] Produtos lidos: ${raw.length}; visíveis: ${total}; partes: ${parts.length} (${parts.map(p => Math.round(Buffer.byteLength(JSON.stringify(p)) / 1024) + 'KB').join(', ')})`);
  if (dryRun) return { parts: parts.length, total };

  const countersRef = db.collection('meta').doc('counters');
  const countersSnap = await countersRef.get();
  const counters = countersSnap.exists ? countersSnap.data() : {};
  const version = typeof counters.productsVersion === 'number' ? counters.productsVersion : 0;
  const oldParts = typeof counters.catalogParts === 'number' ? counters.catalogParts : 0;

  const now = admin.firestore.FieldValue.serverTimestamp();
  const col = db.collection(CATALOG_COLLECTION);
  // Grava as partes primeiro e só depois aponta meta/counters para a nova versão
  for (let i = 0; i < parts.length; i++) {
    await col.doc(`parte-${i + 1}`).set({ v: version, parte: i + 1, total: parts.length, itens: parts[i], geradoEm: now });
  }
  await countersRef.set({ catalogVersion: version, catalogParts: parts.length, catalogUpdatedAt: now }, { merge: true });
  // Remove partes que sobraram de um catálogo maior
  for (let i = parts.length + 1; i <= oldParts; i++) {
    await col.doc(`parte-${i}`).delete();
  }
  log(`[catalog] Catálogo v${version} publicado em ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
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
