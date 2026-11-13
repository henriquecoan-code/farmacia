// Passo 0 do site novo: descobre no ERP (SOMENTE LEITURA) as colunas de tarja/receita e de EAN.
// Não altera nada: a sessão é aberta em modo READ ONLY.
// Uso: powershell -ExecutionPolicy Bypass -File .\site\scripts\run-erp-investigar.ps1   (na raiz do projeto, com VPN)
// Saída: site/scripts/.saida/erp-investigacao.json (fora do Git) + resumo no console.
import pg from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';

const { PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD } = process.env;
if (!PGHOST || !PGDATABASE || !PGUSER) {
  console.error('[erp] Defina PGHOST/PGDATABASE/PGUSER/PGPASSWORD (use o run-erp-investigar.ps1).');
  process.exit(1);
}

const client = new pg.Client({
  host: PGHOST, port: Number(PGPORT || 5432), database: PGDATABASE, user: PGUSER, password: PGPASSWORD,
  connectionTimeoutMillis: 10000,
});

const CANDIDATAS = /tarj|receit|presc|control|lista|portaria|psico|antimic|classe|ean|barra|gtin|cod_bar|mip|venda|flg_|tip_/i;
const q = (id) => '"' + String(id).replace(/"/g, '""') + '"';

const out = { geradoEm: new Date().toISOString(), colunasCadprodu: [], valores: {}, tabelasCodigoBarras: [], colunasCodigoBarras: {} };

try {
  await client.connect();
  await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
  await client.query('SET statement_timeout = 60000');
  if (process.env.PGSCHEMA) await client.query(`SET search_path TO ${q(process.env.PGSCHEMA)}`);

  // 1) Colunas de cadprodu
  const cols = (await client.query(`
    select column_name, data_type from information_schema.columns
    where table_name = 'cadprodu' order by ordinal_position`)).rows;
  out.colunasCadprodu = cols.map((c) => `${c.column_name} (${c.data_type})`);
  console.log(`[erp] cadprodu tem ${cols.length} colunas.`);

  // 2) Valores das colunas candidatas (só produtos ativos)
  for (const c of cols.filter((c) => CANDIDATAS.test(c.column_name))) {
    if (/^(nom_|des_|obs)/i.test(c.column_name)) continue;
    try {
      const r = await client.query(`
        select ${q(c.column_name)}::text as valor, count(*)::int as qtd
        from cadprodu where flg_ativo = 'A'
        group by 1 order by 2 desc limit 15`);
      const distintos = (await client.query(
        `select count(distinct ${q(c.column_name)})::int n from cadprodu where flg_ativo = 'A'`)).rows[0].n;
      out.valores[c.column_name] = { distintos, top: r.rows };
    } catch (e) {
      out.valores[c.column_name] = { erro: e.message };
    }
  }

  // 3) Tabelas que parecem guardar código de barras
  const tabs = (await client.query(`
    select table_name from information_schema.tables
    where table_type = 'BASE TABLE' and table_name ~* '(barra|ean|gtin|codba|cdbar)'
    order by 1`)).rows.map((r) => r.table_name);
  out.tabelasCodigoBarras = tabs;
  for (const t of tabs.slice(0, 10)) {
    const c2 = (await client.query(`
      select column_name, data_type from information_schema.columns where table_name = $1 order by ordinal_position`, [t])).rows;
    const amostra = (await client.query(`select * from ${q(t)} limit 3`)).rows;
    out.colunasCodigoBarras[t] = { colunas: c2.map((c) => `${c.column_name} (${c.data_type})`), amostra };
  }

  // 4) Classe terapêutica (SNGPC: 1 = antimicrobiano, 2 = controle especial) — hoje excluídos do site
  out.classeTerapeutica = (await client.query(`
    select tip_classeterapeutica::text as valor, count(*)::int as qtd
    from cadprodu where flg_ativo = 'A' group by 1 order by 2 desc`)).rows;

  await mkdir(new URL('./.saida/', import.meta.url), { recursive: true });
  const file = new URL('./.saida/erp-investigacao.json', import.meta.url);
  await writeFile(file, JSON.stringify(out, null, 2), 'utf8');

  console.log('[erp] Colunas candidatas e valores mais comuns:');
  for (const [k, v] of Object.entries(out.valores)) {
    if (v.erro) { console.log(`  ${k}: erro ${v.erro}`); continue; }
    console.log(`  ${k} (${v.distintos} valores): ` + v.top.slice(0, 6).map((t) => `${t.valor ?? 'NULL'}=${t.qtd}`).join(', '));
  }
  console.log(`[erp] Tabelas de código de barras: ${tabs.join(', ') || 'nenhuma encontrada'}`);
  console.log(`[erp] Classe terapêutica: ` + out.classeTerapeutica.map((t) => `${t.valor ?? 'NULL'}=${t.qtd}`).join(', '));
  console.log(`[erp] Resultado completo salvo em site/scripts/.saida/erp-investigacao.json`);
} catch (e) {
  console.error('[erp] Falhou:', e.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
