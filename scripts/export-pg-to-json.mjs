// Export PG -> data/products.json for showcase mode (?vitrine=1)
// Usage (PowerShell):
//   $env:PGHOST="host"; $env:PGPORT="5432"; $env:PGDATABASE="db"; $env:PGUSER="user"; $env:PGPASSWORD="pass"; \
//   node ./scripts/export-pg-to-json.mjs

import fs from 'fs/promises';
import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT || 10000),
  idleTimeoutMillis: 10000,
  max: 3
});

const GRUPO_TO_CATEGORIA = {
  10000: 'conveniencia',
  9000:  'correlatos',
  4000:  'genericos',
  8000:  'perfumaria',
  3000:  'referencia',
  2000:  'similares'
};
const mapCategoria = g => GRUPO_TO_CATEGORIA[g] || 'medicamentos';

function calcularPreco(v, d){
  v = Number(v)||0; d = Number(d)||0;
  let preco = v;
  if (d > 0) {
    if (d > 1) {
      const p = Math.min(Math.max(d/100, 0), 1);
      preco = v * (1 - p);
    } else {
      preco = v * (1 - d);
    }
  }
  preco = Math.max(0, preco);
  return { precoMaximo: v, precoComDesconto: +preco.toFixed(2) };
}

async function main(){
  console.log(`[export] Connecting to PG host=${process.env.PGHOST} port=${process.env.PGPORT||5432} db=${process.env.PGDATABASE} user=${process.env.PGUSER} ssl=${process.env.PGSSL==='1'}`);
  const client = await pool.connect();
  try {
    console.log('[export] Connected to PG.');
    const stmtTimeoutMs = Number(process.env.PG_STATEMENT_TIMEOUT || 15000);
    if (Number.isFinite(stmtTimeoutMs) && stmtTimeoutMs > 0) {
      await client.query(`SET statement_timeout = ${stmtTimeoutMs}`);
      console.log(`[export] statement_timeout set to ${stmtTimeoutMs} ms`);
    }
    const schema = process.env.PGSCHEMA;
    if (schema) {
      await client.query(`SET search_path TO ${schema}`);
      console.log(`[export] search_path set to ${schema}`);
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
  const orderByClause = (sampleIds.length || limitClause) ? '' : ' ORDER BY p.cod_reduzido ASC';

  console.log(`[export] Executando SELECT com${sampleClause ? ' filtro de IDs' : ''}${limitClause ? ' e limite '+limitN : ''}${orderByClause ? ' (com ORDER BY)' : ' (sem ORDER BY)'}...`);

    console.time('[export] SELECT');
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
      console.log('[export] SELECT error:', err && err.message ? err.message : String(err));
      throw err;
    }
    console.timeEnd('[export] SELECT');

    const items = rows.map(r => {
      const { precoMaximo, precoComDesconto } = calcularPreco(r.vlr_venda, r.prc_desconto);
      return {
        id: String(r.cod_red),
        nome: r.nome,
        descricao: '',
        categoria: mapCategoria(r.cod_grupo),
        precoMaximo,
        precoComDesconto,
        desconto: (precoMaximo>0) ? Math.round((1 - (precoComDesconto / precoMaximo)) * 100) : 0,
        quantidade: Number(r.quantidade)||0,
        codRed: String(r.cod_red),
        dcb: r.dcb || null,
        laboratorio: r.laboratorio || '',
        destaque: false,
        imagens: []
      };
    });

    await fs.writeFile('data/products.json', JSON.stringify(items, null, 2), 'utf8');
    console.log(`[export] Gerados ${items.length} itens em data/products.json`);
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error('[export] Erro', err); process.exit(1); });
