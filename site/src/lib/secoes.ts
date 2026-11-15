// Seções, nomes de categoria e utilidades de exibição. Sem dependências de Node:
// usado tanto no build (páginas) quanto no navegador (resultados da busca).

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

/** Nome curto (menu no celular) e ícone (conteúdo de um <svg viewBox="0 0 24 24">) de cada seção */
export const MENU_SECAO: Record<string, { curto: string; icone: string }> = {
  medicamentos: { curto: 'Medicamentos',
    icone: '<rect x="2.5" y="8" width="19" height="8" rx="4" transform="rotate(-35 12 12)"/><path d="m8.6 7.2 6.8 9.6"/>' },
  dermocosmeticos: { curto: 'Perfumaria',
    icone: '<path d="M9 2h6v3H9z"/><path d="M8 5h8l1 3v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8z"/><path d="M7 12h10"/>' },
  suplementos: { curto: 'Suplementos',
    icone: '<path d="M5 19C5 10 11 4 20 4c0 9-6 15-15 15z"/><path d="M5 19 13 11"/>' },
  hospitalares: { curto: 'Saúde',
    icone: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M9 6V4h6v2M12 10v6M9 13h6"/>' },
};

/** Nome no plural dos tipos de medicamento (submenu e páginas /tipo/) */
export const NOME_TIPO: Record<string, string> = {
  genericos: 'Genéricos', referencia: 'Referência', similares: 'Similares', medicamentos: 'Outros medicamentos',
};

export const NOME_CATEGORIA: Record<string, string> = {
  genericos: 'Genérico', referencia: 'Referência', similares: 'Similar', medicamentos: 'Medicamento',
  dermocosmeticos: 'Perfumaria e dermocosméticos', suplementos: 'Suplementos e conveniência', hospitalares: 'Saúde e correlatos',
};

export const secaoDaCategoria = (cat: string) => SECOES.find((s) => s.categorias.includes(cat)) ?? SECOES[0];

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** "DIPIRONA 500MG 10CP" -> { principal: "DIPIRONA", detalhe: "500MG 10CP" } (card sem foto) */
export function dividirNome(nome: string) {
  const palavras = nome.split(/\s+/);
  const iDose = palavras.findIndex((w, i) => i > 0 && /\d/.test(w));
  return {
    principal: (iDose > 0 ? palavras.slice(0, iDose) : palavras.slice(0, 3)).join(' '),
    detalhe: iDose > 0 ? palavras.slice(iDose).join(' ') : '',
  };
}
