// Estado local da sincronização: o que o sync gravou por último no Firestore, por produto.
// Com ele, os syncs comparam o Postgres com este arquivo (0 leituras no Firestore) e gravam só o que mudou.
// Arquivo: scripts/.state/produtos-sync.json (fora do Git). Formato:
//   { versao: 1, geradoEm, itens: { "<id>": { h: "<hash dos campos do sync>", q: <quantidade> } } }
// Reconstruir a partir do Firestore (~1 leitura por produto):
//   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\Keys\\<sua-chave>.json"
//   node .\\scripts\\sync-state.mjs --rebuild

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const STATE_FILE = path.join(__dirname, '.state', 'produtos-sync.json');

// Campos que o sync completo (sync-pg-to-firestore.mjs) grava, exceto quantidade (comparada à parte)
// e atualizadoEm/publicado (não indicam mudança de dados do Postgres)
export const HASH_FIELDS = [
  'nome', 'descricao', 'categoria', 'precoMaximo', 'precoComDesconto', 'desconto',
  'codRed', 'dcb', 'laboratorio', 'destaque', 'ativo', 'imagens', 'pendente', 'motivosBloqueio'
];

export function hashPayload(obj) {
  const picked = HASH_FIELDS.map(k => [k, obj[k] === undefined ? null : obj[k]]);
  return crypto.createHash('sha1').update(JSON.stringify(picked)).digest('hex').slice(0, 16);
}

export async function loadState() {
  try {
    const raw = JSON.parse(await fs.readFile(STATE_FILE, 'utf8'));
    if (raw && raw.versao === 1 && raw.itens && typeof raw.itens === 'object') return raw;
  } catch {}
  return null;
}

// Escrita atômica: grava em .tmp e renomeia (não corrompe se o processo cair no meio)
export async function saveState(state) {
  state.geradoEm = new Date().toISOString();
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  const tmp = STATE_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(state));
  await fs.rename(tmp, STATE_FILE);
}

// Lê a coleção `produtos` uma vez e recria o estado (~1 leitura por produto)
export async function rebuildState(db, { log = console.log } = {}) {
  const t0 = Date.now();
  const snap = await db.collection('produtos').get();
  const itens = {};
  snap.forEach(d => {
    const data = d.data();
    itens[d.id] = { h: hashPayload(data), q: Number(data.quantidade) || 0 };
  });
  const state = { versao: 1, itens };
  await saveState(state);
  log(`[state] Estado reconstruído: ${snap.size} produtos em ${((Date.now() - t0) / 1000).toFixed(1)}s (${snap.size} leituras).`);
  return state;
}

// Carrega o estado; se não existir, reconstrói a partir do Firestore
export async function loadOrRebuildState(db, { log = console.log } = {}) {
  const state = await loadState();
  if (state) {
    log(`[state] Estado local: ${Object.keys(state.itens).length} produtos (gerado em ${state.geradoEm}).`);
    return state;
  }
  log('[state] Estado local não encontrado; reconstruindo a partir do Firestore (uma vez)...');
  return rebuildState(db, { log });
}

// Execução direta: node scripts/sync-state.mjs --rebuild
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (!process.argv.includes('--rebuild')) {
    const st = await loadState();
    console.log(st ? `[state] ${Object.keys(st.itens).length} produtos; gerado em ${st.geradoEm}; arquivo: ${STATE_FILE}` : `[state] Sem estado em ${STATE_FILE}. Use --rebuild.`);
  } else {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.error('[state] Defina GOOGLE_APPLICATION_CREDENTIALS com o caminho do service account do Firebase.');
      process.exit(1);
    }
    try { admin.initializeApp({ credential: admin.credential.applicationDefault() }); } catch {}
    await rebuildState(admin.firestore()).catch(err => { console.error('[state] Erro', err); process.exit(1); });
  }
}
