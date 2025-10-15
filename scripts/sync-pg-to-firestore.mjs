// PG -> Firestore sync script
// Usage (PowerShell):
//   $env:PGHOST="host"; $env:PGPORT="5432"; $env:PGDATABASE="db"; $env:PGUSER="user"; $env:PGPASSWORD="pass"; \
//   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\serviceAccount.json"; \
//   node ./scripts/sync-pg-to-firestore.mjs

import pg from 'pg';
import admin from 'firebase-admin';

const {
  PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD,
  GOOGLE_APPLICATION_CREDENTIALS, PGSSL
} = process.env;

if (!PGHOST || !PGDATABASE || !PGUSER) {
  console.error('[sync] Defina PGHOST/PGDATABASE/PGUSER (e PGPASSWORD se houver).');
  process.exit(1);
}
if (!GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('[sync] Defina GOOGLE_APPLICATION_CREDENTIALS com o caminho do service account do Firebase.');
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
  ssl: PGSSL === '1' ? { rejectUnauthorized: false } : undefined
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
    const { rows } = await client.query(`
      SELECT p.cod_reduzido AS cod_red, p.nom_produto AS nome, p.cod_grupo, p.vlr_venda, p.prc_desconto,
             d.nom_dcb AS dcb, l.nom_laborat AS laboratorio, e.qtd_estoque AS quantidade
      FROM cadprodu p
      JOIN cadestoq e USING (cod_reduzido)
      LEFT JOIN cadcddcb d ON d.cod_dcb = p.cod_dcb
      LEFT JOIN cadlabor l ON l.cod_laborat = p.cod_laborat
      WHERE p.flg_ativo = 'A'
        AND (p.tip_classeterapeutica IS NULL OR p.tip_classeterapeutica = '')
        AND e.qtd_estoque > 0
    `);

    if (!rows.length) {
      console.warn('[sync] Nenhum produto retornado pelo SELECT.');
    }

    const col = db.collection('produtos');
    let batch = db.batch();
    let ops = 0;

    for (const r of rows) {
      const { precoMaximo, precoComDesconto } = calcularPreco(r.vlr_venda, r.prc_desconto);
      const id = String(r.cod_red);
      const payload = {
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
      batch.set(col.doc(id), payload, { merge: true });
      ops++;

      // Commit em lotes de 400 para não estourar limites
      if (ops % 400 === 0) { await batch.commit(); batch = db.batch(); }
    }

    if (ops % 400 !== 0) { await batch.commit(); }
    await bumpProductsVersion();

    console.log(`[sync] Sincronizados ${ops} produtos.`);
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error('[sync] Erro', err); process.exit(1); });
