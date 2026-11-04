// Sincroniza produtos ERP (Postgres da farmácia, SOMENTE LEITURA) -> Supabase (banco do site).
// Uso: powershell -ExecutionPolicy Bypass -File .\site\scripts\run-sync-erp.ps1   (na raiz do projeto, com VPN)
//
// Variáveis:
//   PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD  ERP (sessão aberta em READ ONLY)
//   SUPABASE_DB_URL      conexão Postgres do Supabase (Session pooler), com a senha do banco
//   SUPABASE_DB_CA       (opcional) caminho do certificado CA do Supabase para validar o TLS
//   SYNC_MODO            completo (padrão) | estoque
//   DRY_RUN=1            faz tudo numa transação e desfaz no fim (mostra o que mudaria)
//   SYNC_LIMIT / SYNC_SAMPLE_IDS   amostra para teste (desliga o "zerar ausentes")
//   ESTOQUE_COD_FILIAL   filial do estoque (padrão 3)
//   ERP_EXPR_PRESCRICAO  (opcional) expressão SQL booleana sobre "p" (cadprodu) que indica venda sob prescrição
//   ERP_EXPR_EAN         (opcional) expressão SQL que devolve o EAN do produto
//   GITHUB_TOKEN + GITHUB_REPO   (opcional) dispara o build do site quando o catálogo muda
// As expressões ERP_EXPR_* vêm do runner .ps1 (configuração local do operador), nunca de entrada externa.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { carregarFiltros, linhaParaProduto } from './lib/produtos-erp.mjs';
import { aplicarCompleto, aplicarEstoque } from './lib/gravar-supabase.mjs';

const env = process.env;
const MODO = (env.SYNC_MODO || 'completo').toLowerCase();
const DRY_RUN = env.DRY_RUN === '1';
const log = (m) => console.log(`[sync-erp] ${m}`);

if (!['completo', 'estoque'].includes(MODO)) { console.error(`SYNC_MODO inválido: ${MODO}`); process.exit(1); }
for (const k of ['PGHOST', 'PGDATABASE', 'PGUSER', 'SUPABASE_DB_URL']) {
  if (!env[k]) { console.error(`[sync-erp] Defina ${k} (use o run-sync-erp.ps1).`); process.exit(1); }
}

const filial = Number(env.ESTOQUE_COD_FILIAL || 3);
if (!Number.isInteger(filial)) { console.error('ESTOQUE_COD_FILIAL inválido'); process.exit(1); }
const limit = Number(env.SYNC_LIMIT || 0);
const sampleIds = (env.SYNC_SAMPLE_IDS || '').split(',').map((s) => Number(s.trim())).filter(Number.isInteger);
const amostra = sampleIds.length > 0 || limit > 0;

// ------------------------------------------------------------------ ERP (somente leitura)
async function lerErp() {
  const erp = new pg.Client({
    host: env.PGHOST, port: Number(env.PGPORT || 5432), database: env.PGDATABASE,
    user: env.PGUSER, password: env.PGPASSWORD,
    connectionTimeoutMillis: Number(env.PG_CONNECT_TIMEOUT || 10000),
  });
  await erp.connect();
  try {
    await erp.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
    await erp.query(`SET statement_timeout = ${Number(env.PG_STATEMENT_TIMEOUT || 60000)}`);
    if (env.PGSCHEMA) await erp.query(`SET search_path TO "${env.PGSCHEMA.replace(/"/g, '')}"`);

    const where = `
      WHERE p.flg_ativo = 'A'
        -- SNGPC: classe terapêutica 1 = antimicrobiano, 2 = controle especial -> nunca vão para o site
        AND (p.tip_classeterapeutica IS NULL OR NULLIF(TRIM(p.tip_classeterapeutica::text), '') IS NULL)
        ${sampleIds.length ? `AND p.cod_reduzido IN (${sampleIds.join(',')})` : ''}
      ORDER BY p.cod_reduzido
      ${limit > 0 ? `LIMIT ${Math.trunc(limit)}` : ''}`;

    if (MODO === 'estoque') {
      const res = await erp.query(`
        SELECT p.cod_reduzido AS cod_red, COALESCE(e.qtd_estoque, 0) AS estoque
        FROM cadprodu p
        LEFT JOIN cadestoq e ON e.cod_reduzido = p.cod_reduzido AND e.cod_filial = ${filial}
        ${where}`);
      return res.rows.map((r) => ({ cod_red: Number(r.cod_red), estoque: Number(r.estoque) }));
    }

    const exprPresc = env.ERP_EXPR_PRESCRICAO ? `(${env.ERP_EXPR_PRESCRICAO})` : 'NULL::boolean';
    const exprEan = env.ERP_EXPR_EAN ? `(${env.ERP_EXPR_EAN})::text` : 'NULL::text';
    const res = await erp.query(`
      SELECT p.cod_reduzido AS cod_red, p.nom_produto AS nome, p.nom_prodcomp AS nome_comp, p.cod_grupo,
             p.vlr_venda, p.prc_desconto, d.nom_dcb AS dcb, l.nom_laborat AS laboratorio,
             COALESCE(e.qtd_estoque, 0) AS quantidade,
             ${exprPresc} AS prescricao, ${exprEan} AS ean
      FROM cadprodu p
      LEFT JOIN cadestoq e ON e.cod_reduzido = p.cod_reduzido AND e.cod_filial = ${filial}
      LEFT JOIN cadcddcb d ON d.cod_dcb = p.cod_dcb
      LEFT JOIN cadlabor l ON l.cod_laborat = p.cod_laborat
      ${where}`);
    return res.rows;
  } finally {
    await erp.end().catch(() => {});
  }
}

// ------------------------------------------------------------------ Supabase
function sslSupabase() {
  if (env.SUPABASE_DB_CA) return { ca: readFileSync(env.SUPABASE_DB_CA, 'utf8'), rejectUnauthorized: true };
  log('aviso: SUPABASE_DB_CA não definido; TLS sem validar o certificado do servidor.');
  return { rejectUnauthorized: false };
}

async function dispararBuild(motivo) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) { log('build do site: GITHUB_TOKEN/GITHUB_REPO não definidos, pulando.'); return; }
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'farmacia-sync-erp' },
    body: JSON.stringify({ event_type: 'catalogo-atualizado', client_payload: { motivo } }),
  });
  log(res.ok ? 'build do site disparado.' : `falha ao disparar build: HTTP ${res.status}`);
}

async function main() {
  const t0 = Date.now();
  log(`modo=${MODO}${DRY_RUN ? ' [DRY_RUN]' : ''}${amostra ? ' [amostra]' : ''} filial=${filial}`);
  const linhas = await lerErp();
  log(`ERP: ${linhas.length} produtos lidos (somente leitura).`);
  if (!linhas.length) { log('nada a fazer.'); return; }

  const sb = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: sslSupabase(), connectionTimeoutMillis: 15000 });
  await sb.connect();
  let resultado;
  try {
    await sb.query('BEGIN');
    if (MODO === 'estoque') {
      resultado = await aplicarEstoque(sb, linhas, { zerarAusentes: !amostra });
      log(`estoque: ${resultado.alterados} alterados, ${resultado.zerados} zerados (saíram do ERP).`);
    } else {
      const F = carregarFiltros();
      const produtos = linhas.map((r) => linhaParaProduto(r, F));
      const pend = produtos.filter((p) => p.pendente).length;
      const presc = produtos.filter((p) => p.tipo_venda === 'prescricao').length;
      log(`transformados: ${produtos.length} (bloqueados pelos filtros: ${pend}; prescrição: ${presc}${env.ERP_EXPR_PRESCRICAO ? '' : ' — padrão por categoria'}).`);
      resultado = await aplicarCompleto(sb, produtos, { zerarAusentes: !amostra });
      log(`completo: ${resultado.novos} novos, ${resultado.alterados} alterados, ${resultado.zerados} zerados.`);
    }
    await sb.query(DRY_RUN ? 'ROLLBACK' : 'COMMIT');
    if (DRY_RUN) log('DRY_RUN: alterações desfeitas.');
  } catch (e) {
    await sb.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await sb.end().catch(() => {});
  }

  const mudouCatalogo = MODO === 'completo'
    ? (resultado.novos + resultado.alterados + resultado.zerados) > 0
    : resultado.visibilidadeMudou > 0;
  if (!DRY_RUN && mudouCatalogo) await dispararBuild(`${MODO}: ${JSON.stringify(resultado)}`);
  log(`concluído em ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
}

main().catch((e) => {
  console.error('[sync-erp] Falhou:', e?.message || e);
  process.exitCode = 1;
});
