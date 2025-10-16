// Clean products in Firestore: deactivate or delete items with quantidade <= 0
// Env:
//   GOOGLE_APPLICATION_CREDENTIALS: path to Firebase Admin service account JSON
//   CLEAN_MODE: 'deactivate' (default) | 'delete'
//   DRY_RUN: '1' (default) to preview only | '0' to apply changes
//   BATCH_SIZE: optional, default 400

import admin from 'firebase-admin';

const { CLEAN_MODE, DRY_RUN, BATCH_SIZE } = process.env;
const mode = (CLEAN_MODE || 'deactivate').toLowerCase();
const dryRun = (DRY_RUN || '1') !== '0';
const batchSize = Math.min(Math.max(Number(BATCH_SIZE || 400), 1), 450);

try { admin.initializeApp({ credential: admin.credential.applicationDefault() }); } catch {}
const db = admin.firestore();

async function* queryProductsToClean() {
  const FieldPath = admin.firestore.FieldPath;
  // Order to allow pagination with cursor
  let q = db.collection('produtos')
    .where('quantidade', '<=', 0)
    .orderBy('quantidade')
    .orderBy(FieldPath.documentId())
    .limit(500);
  let last = null;
  while (true) {
    const snap = last ? await q.startAfter(last).get() : await q.get();
    if (snap.empty) break;
    yield snap.docs;
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 500) break;
  }
}

async function main(){
  console.log(`[clean] Start. mode=${mode} dryRun=${dryRun} batchSize=${batchSize}`);
  let total = 0;
  let toProcess = [];
  for await (const docs of queryProductsToClean()) {
    for (const d of docs) {
      const data = d.data();
      toProcess.push({ id: d.id, nome: data.nome || data.name || '', quantidade: data.quantidade });
    }
  }
  console.log(`[clean] Found ${toProcess.length} produtos with quantidade <= 0`);
  if (dryRun || toProcess.length === 0) {
    toProcess.slice(0, 10).forEach(p => console.log(` - id=${p.id} nome=${p.nome} qtd=${p.quantidade}`));
    if (toProcess.length > 10) console.log(` ... and ${toProcess.length - 10} more`);
    return;
  }

  // Apply changes in batches
  let idx = 0;
  while (idx < toProcess.length) {
    const slice = toProcess.slice(idx, idx + batchSize);
    const batch = db.batch();
    for (const p of slice) {
      const ref = db.collection('produtos').doc(p.id);
      if (mode === 'delete') {
        batch.delete(ref);
      } else {
        batch.set(ref, { ativo: false, atualizadoEm: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
    }
    console.log(`[clean] Committing ${slice.length} changes...`);
    await batch.commit();
    total += slice.length;
    idx += slice.length;
  }
  console.log(`[clean] Done. ${mode === 'delete' ? 'Deleted' : 'Inactivated'} ${total} produtos.`);

  // bump productsVersion for cache invalidation
  try {
    const ref = db.collection('meta').doc('counters');
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const curr = snap.exists ? (snap.data().productsVersion || 0) : 0;
      tx.set(ref, {
        productsVersion: curr + 1,
        productsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });
    console.log('[clean] productsVersion bumped.');
  } catch (e) {
    console.warn('[clean] Failed to bump productsVersion', e && e.message ? e.message : e);
  }
}

main().catch(e => { console.error('[clean] Error', e); process.exit(1); });
