// Catálogo usado no BUILD (páginas estáticas).
// Fonte: view produtos_publicos do Supabase; sem Supabase configurado, usa ../data/products.json
// (exportação antiga do site) como exemplo, para desenvolver o visual.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// regras compartilhadas com o sync do ERP (módulo JS)
import { carregarFiltros, motivosBloqueio } from '../../scripts/lib/produtos-erp.mjs';

export type TipoVenda = 'mip' | 'prescricao';
export interface Produto {
  cod_red: number;
  slug: string;
  nome: string;
  dcb: string | null;
  laboratorio: string | null;
  ean: string | null;
  categoria: string;
  preco_maximo: number;
  preco: number;
  estoque: number;
  tipo_venda: TipoVenda;
  destaque: boolean;
  descricao: string | null;
  fotos: string[];
}

export interface Secao {
  slug: string;
  nome: string;
  descricao: string;
  categorias: string[];
  cor: string; // cor do card sem foto
}

export const SECOES: Secao[] = [
  { slug: 'medicamentos', nome: 'Medicamentos', descricao: 'Genéricos, referência e similares.', categorias: ['genericos', 'referencia', 'similares', 'medicamentos'], cor: '#1e40af' },
  { slug: 'dermocosmeticos', nome: 'Perfumaria e dermocosméticos', descricao: 'Cuidados com a pele, cabelo, higiene e perfumaria.', categorias: ['dermocosmeticos'], cor: '#9d174d' },
  { slug: 'suplementos', nome: 'Suplementos e conveniência', descricao: 'Vitaminas, suplementos e itens de conveniência.', categorias: ['suplementos'], cor: '#047857' },
  { slug: 'hospitalares', nome: 'Saúde e correlatos', descricao: 'Curativos, aparelhos e materiais de saúde.', categorias: ['hospitalares'], cor: '#b45309' },
];

export const NOME_CATEGORIA: Record<string, string> = {
  genericos: 'Genérico', referencia: 'Referência', similares: 'Similar', medicamentos: 'Medicamento',
  dermocosmeticos: 'Perfumaria e dermocosméticos', suplementos: 'Suplementos e conveniência', hospitalares: 'Saúde e correlatos',
};

export const secaoDaCategoria = (cat: string) => SECOES.find((s) => s.categorias.includes(cat)) ?? SECOES[0];

const CATEGORIAS_MEDICAMENTO = new Set(['genericos', 'referencia', 'similares', 'medicamentos']);
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const slugify = (nome: string, cod: number) =>
  `${semAcento(nome).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/g, '') || 'produto'}-${cod}`;

async function doSupabase(url: string, key: string): Promise<Produto[]> {
  const todos: Produto[] = [];
  const passo = 1000;
  for (let ini = 0; ; ini += passo) {
    const res = await fetch(`${url}/rest/v1/produtos_publicos?select=*&order=cod_red`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${ini}-${ini + passo - 1}`, 'Range-Unit': 'items' },
    });
    if (!res.ok) throw new Error(`Supabase respondeu HTTP ${res.status} ao ler produtos_publicos`);
    const lote = (await res.json()) as any[];
    todos.push(...lote.map((p) => ({ ...p, cod_red: Number(p.cod_red), preco: Number(p.preco), preco_maximo: Number(p.preco_maximo) })));
    if (lote.length < passo) break;
  }
  return todos;
}

function doExemplo(): Produto[] {
  // caminho relativo à pasta site/ (onde o build roda); import.meta.url muda depois do bundle
  const raw = JSON.parse(readFileSync(resolve(process.cwd(), '../data/products.json'), 'utf8')) as any[];
  const filtros = carregarFiltros(new URL(`file:///${resolve(process.cwd(), '../config/product-filters.json').replace(/\\/g, '/')}`));
  return raw
    .filter((p) => Number(p.quantidade) > 0 && Number(p.precoComDesconto) > 0)
    // mesmas regras de bloqueio do sync (config/product-filters.json)
    .filter((p) => motivosBloqueio({ codRed: p.codRed, nome: p.nome, codGrupo: null, categoria: p.categoria,
      preco: Number(p.precoComDesconto), precoMaximo: Number(p.precoMaximo), dcb: p.dcb, laboratorio: p.laboratorio }, filtros).length === 0)
    .map((p) => {
      const cod = Number(p.codRed ?? p.id);
      return {
        cod_red: cod,
        slug: slugify(String(p.nome), cod),
        nome: String(p.nome).trim(),
        dcb: p.dcb || null,
        laboratorio: p.laboratorio || null,
        ean: null,
        categoria: p.categoria || 'medicamentos',
        preco_maximo: Number(p.precoMaximo) || Number(p.precoComDesconto),
        preco: Number(p.precoComDesconto),
        estoque: Number(p.quantidade),
        tipo_venda: CATEGORIAS_MEDICAMENTO.has(p.categoria) ? 'prescricao' : 'mip',
        destaque: false,
        descricao: p.descricao || null,
        fotos: [],
      } satisfies Produto;
    });
}

let cache: Promise<Produto[]> | null = null;
export function carregarProdutos(): Promise<Produto[]> {
  if (!cache) {
    const url = import.meta.env.PUBLIC_SUPABASE_URL;
    const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
    cache = (url && key ? doSupabase(url, key) : Promise.resolve(doExemplo())).then((lista) => {
      if (!url) console.warn(`[catalogo] Supabase não configurado: usando ${lista.length} produtos de exemplo (data/products.json).`);
      return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    });
  }
  return cache;
}

export const temDesconto = (p: Produto) => p.preco_maximo > p.preco + 0.004;
export const percentualDesconto = (p: Produto) => Math.round((1 - p.preco / p.preco_maximo) * 100);
export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Destaques da home: só MIP (RDC 96/2008). Sem destaque marcado no admin, mostra os maiores descontos.
export function destaquesHome(produtos: Produto[], n = 12): Produto[] {
  const mip = produtos.filter((p) => p.tipo_venda === 'mip');
  const marcados = mip.filter((p) => p.destaque);
  if (marcados.length >= 4) return marcados.slice(0, n);
  return [...mip].sort((a, b) => percentualDesconto(b) - percentualDesconto(a) || b.estoque - a.estoque).slice(0, n);
}
