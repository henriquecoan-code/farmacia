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
  ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: false } : undefined
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
  const isPercent = d > 0 && d <= 1;
  const preco = isPercent ? v * (1 - d) : Math.max(0, v - d);
  return { precoMaximo: v, precoComDesconto: +preco.toFixed(2) };
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
