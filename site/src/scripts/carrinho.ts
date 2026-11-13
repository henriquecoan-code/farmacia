// Carrinho no navegador (localStorage). O preço aqui é só referência: o total do pedido é
// sempre recalculado no banco (criar_pedido). A revalidação ao abrir o carrinho entra na fase 3.
export interface ItemCarrinho {
  cod_red: number;
  slug: string;
  nome: string;
  preco: number;
  estoque: number;
  tipo_venda: 'mip' | 'prescricao';
  quantidade: number;
  selecionado: boolean;
}

const CHAVE = 'sb_carrinho_v1';

export function lerCarrinho(): ItemCarrinho[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function salvar(itens: ItemCarrinho[]) {
  try { localStorage.setItem(CHAVE, JSON.stringify(itens)); } catch { /* modo privado / bloqueado */ }
  window.dispatchEvent(new CustomEvent('carrinho:mudou', { detail: itens }));
}

export function adicionar(item: Omit<ItemCarrinho, 'quantidade' | 'selecionado'>, quantidade = 1) {
  const itens = lerCarrinho();
  const atual = itens.find((i) => i.cod_red === item.cod_red);
  const limite = Math.max(0, item.estoque);
  if (atual) {
    Object.assign(atual, item);
    atual.quantidade = Math.min(limite, atual.quantidade + quantidade);
    atual.selecionado = true;
  } else {
    itens.push({ ...item, quantidade: Math.min(limite, quantidade), selecionado: true });
  }
  salvar(itens.filter((i) => i.quantidade > 0));
}

export function alterarQuantidade(cod_red: number, quantidade: number) {
  const itens = lerCarrinho();
  const it = itens.find((i) => i.cod_red === cod_red);
  if (!it) return;
  it.quantidade = Math.max(1, Math.min(it.estoque || 1, Math.trunc(quantidade) || 1));
  salvar(itens);
}

export function remover(cod_red: number) {
  salvar(lerCarrinho().filter((i) => i.cod_red !== cod_red));
}

export function selecionar(cod_red: number, selecionado: boolean) {
  const itens = lerCarrinho();
  const it = itens.find((i) => i.cod_red === cod_red);
  if (it) { it.selecionado = selecionado; salvar(itens); }
}

export const totalItens = (itens = lerCarrinho()) => itens.reduce((s, i) => s + i.quantidade, 0);
