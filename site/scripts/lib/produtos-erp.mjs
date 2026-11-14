// Regras de transformação ERP -> produto do site. Funções puras (testáveis).
// Portadas de scripts/sync-pg-to-firestore.mjs (site antigo).
import { readFileSync } from 'node:fs';

// Grupos do ERP -> categorias do site
export const GRUPO_TO_CATEGORIA = {
  10000: 'suplementos',     // conveniência
  9000: 'hospitalares',     // correlatos
  4000: 'genericos',
  8000: 'dermocosmeticos',  // perfumaria
  3000: 'referencia',
  2000: 'similares',
};
export const mapCategoria = (g) => GRUPO_TO_CATEGORIA[Number(g)] || 'medicamentos';

// Categorias que são medicamento: sem informação de tarja do ERP, ficam como "prescricao" (mais seguro)
export const CATEGORIAS_MEDICAMENTO = new Set(['genericos', 'referencia', 'similares', 'medicamentos']);

export function calcularPreco(vlr_venda, prc_desconto) {
  const v = Number(vlr_venda) || 0;
  const d = Number(prc_desconto) || 0;
  let preco = v;
  if (d > 0) preco = d > 1 ? v * (1 - Math.min(Math.max(d / 100, 0), 1)) : v * (1 - d);
  preco = Math.max(0, preco);
  return { precoMaximo: +v.toFixed(2), preco: +preco.toFixed(2) };
}

const FILTROS_PADRAO = {
  disallowedKeywords: ['entrega', 'resto de compras', 'resto compras', 'aplicação', 'aplica', 'f2'],
  disallowedGroups: [],
  minPrice: 0.01,
  minPriceByCategory: {},
  minPriceByGroup: {},
  requireDcb: false,
  requireLaboratorio: false,
  minNameLength: 0,
  maxDiscountPercent: 95,
  blockIfRegex: [],
  allowListIds: [],
};

export function carregarFiltros(url = new URL('../../../config/product-filters.json', import.meta.url)) {
  try {
    return { ...FILTROS_PADRAO, ...JSON.parse(readFileSync(url, 'utf8')) };
  } catch {
    return { ...FILTROS_PADRAO };
  }
}

export const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

export function motivosBloqueio(p, F) {
  const reasons = [];
  if ((F.allowListIds || []).map(String).includes(String(p.codRed))) return reasons;
  const txt = semAcento(p.nome).toLowerCase();
  for (const kw of F.disallowedKeywords || []) {
    const k = semAcento(kw).toLowerCase();
    if (k && txt.includes(k)) reasons.push(`palavra:${kw}`);
  }
  if ((F.disallowedGroups || []).map(Number).includes(Number(p.codGrupo))) reasons.push(`grupo:${p.codGrupo}`);
  for (const pattern of F.blockIfRegex || []) {
    try { if (new RegExp(pattern, 'i').test(String(p.nome || ''))) reasons.push(`regex:${pattern}`); } catch {}
  }
  const effMin = [Number(F.minPrice || 0), Number(F.minPriceByCategory?.[p.categoria]), Number(F.minPriceByGroup?.[String(p.codGrupo)])]
    .filter(Number.isFinite).reduce((a, b) => Math.max(a, b), 0);
  if (!(p.preco >= effMin)) reasons.push(`sem_valor_min=${effMin}`);
  if (!(p.precoMaximo >= effMin)) reasons.push('preco_max_zero');
  if (F.requireDcb && !p.dcb) reasons.push('sem_dcb');
  if (F.requireLaboratorio && !p.laboratorio) reasons.push('sem_laboratorio');
  if (Number(F.minNameLength || 0) > 0 && String(p.nome || '').trim().length < Number(F.minNameLength)) reasons.push('nome_curto');
  const desconto = p.precoMaximo > 0 ? Math.round((1 - p.preco / p.precoMaximo) * 100) : 0;
  if (Number.isFinite(Number(F.maxDiscountPercent)) && desconto > Number(F.maxDiscountPercent)) {
    reasons.push(`desconto_acima_${F.maxDiscountPercent}%`);
  }
  return reasons;
}

export function slugify(nome, codRed) {
  const base = semAcento(nome).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/g, '');
  return `${base || 'produto'}-${codRed}`;
}

// Linha do ERP (SELECT do sync) -> linha da tabela produtos
export function linhaParaProduto(r, F) {
  const codRed = Number(r.cod_red);
  const isPerfumaria = Number(r.cod_grupo) === 8000;
  const nomeComp = String(r.nome_comp || '').trim();
  const nome = String((isPerfumaria && nomeComp) ? nomeComp : (r.nome || '')).trim();
  const categoria = mapCategoria(r.cod_grupo);
  const { precoMaximo, preco } = calcularPreco(r.vlr_venda, r.prc_desconto);
  // r.prescricao: resultado da expressão ERP_EXPR_PRESCRICAO (true/false) ou null se não configurada
  const tipoVenda = (r.prescricao === true || r.prescricao === false)
    ? (r.prescricao ? 'prescricao' : 'mip')
    : (CATEGORIAS_MEDICAMENTO.has(categoria) ? 'prescricao' : 'mip');
  // Um ou mais EANs separados por vírgula/espaço (cadcdbar); cada um só com dígitos
  const ean = r.ean
    ? [...new Set(String(r.ean).split(/[,;\s]+/).map((e) => e.replace(/\D/g, '')).filter(Boolean))].join(',') || null
    : null;
  const base = {
    cod_red: codRed,
    slug: slugify(nome, codRed),
    nome,
    dcb: r.dcb ? String(r.dcb).trim() : null,
    laboratorio: r.laboratorio ? String(r.laboratorio).trim() : null,
    ean,
    categoria,
    cod_grupo: r.cod_grupo == null ? null : Number(r.cod_grupo),
    preco_maximo: precoMaximo,
    preco,
    estoque: Math.max(0, Math.trunc(Number(r.quantidade) || 0)),
    tipo_venda: tipoVenda,
  };
  const motivos = motivosBloqueio({ codRed, nome, codGrupo: r.cod_grupo, categoria, preco, precoMaximo, dcb: base.dcb, laboratorio: base.laboratorio }, F);
  return { ...base, pendente: motivos.length > 0, motivos_bloqueio: motivos };
}
