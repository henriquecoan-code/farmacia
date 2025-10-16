import admin from 'firebase-admin';

try {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
} catch (e) {}
const db = admin.firestore();

async function main(){
  const snap = await db.collection('produtos').limit(20).get();
  console.log(`[list] produtos count fetched: ${snap.size}`);
  let i = 0;
  snap.forEach(doc => {
    const d = doc.data();
    console.log(`[${++i}] id=${doc.id} nome=${d.nome || d.name || ''} precoComDesconto=${d.precoComDesconto ?? d.price ?? ''} categoria=${d.categoria || d.category || ''}`);
  });
  try {
    const recent = await db.collection('produtos').orderBy('atualizadoEm','desc').limit(5).get();
    console.log('[list] mais recentes por atualizadoEm:');
    recent.forEach(doc => {
      const d = doc.data();
      console.log(` - id=${doc.id} nome=${d.nome || ''} atualizadoEm=${d.atualizadoEm}`);
    });
  } catch (e) {
    console.log('[list] skip recent by atualizadoEm (maybe no index or field).');
  }
  const meta = await db.collection('meta').doc('counters').get();
  console.log('[list] meta/counters:', meta.exists ? meta.data() : 'not found');
}

main().catch(e => { console.error('[list] error', e); process.exit(1); });
