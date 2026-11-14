// Monta no navegador o mesmo HTML de components/ProdutoCard.astro (usado nos resultados da busca).
import { brl, dividirNome, secaoDaCategoria } from '../lib/secoes';

export interface ProdutoBusca {
  cod_red: number;
  slug: string;
  nome: string;
  preco: number;
  preco_maximo: number;
  estoque: number;
  tipo_venda: 'mip' | 'prescricao';
  laboratorio: string | null;
  categoria: string;
  foto: string | null;
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function imagem(p: ProdutoBusca) {
  if (p.foto) return `<img class="foto" src="${esc(p.foto)}" alt="${esc(p.nome)}" width="280" height="280" loading="lazy" decoding="async">`;
  const { principal, detalhe } = dividirNome(p.nome);
  return `<div class="sem-foto" style="--cor:${secaoDaCategoria(p.categoria).cor}" role="img" aria-label="Imagem ilustrativa: ${esc(p.nome)}">
    <span class="sem-foto__nome">${esc(principal.toLowerCase())}</span>
    ${detalhe ? `<span class="sem-foto__det">${esc(detalhe.toLowerCase())}</span>` : ''}
    ${p.laboratorio ? `<span class="sem-foto__lab">${esc(p.laboratorio.toLowerCase())}</span>` : ''}
  </div>`;
}

export function cardHtml(p: ProdutoBusca, base: string) {
  const desconto = p.preco_maximo > p.preco + 0.004;
  const pct = Math.round((1 - p.preco / p.preco_maximo) * 100);
  const carrinho = { cod_red: p.cod_red, slug: p.slug, nome: p.nome, preco: p.preco, estoque: p.estoque, tipo_venda: p.tipo_venda };
  return `<article class="card">
  <a class="card__link" href="${base}/produto/${esc(p.slug)}/">
    ${imagem(p)}
    <div class="card__selos">
    </div>
    <h3 class="card__nome">${esc(p.nome)}</h3>
    ${p.laboratorio ? `<p class="card__lab">${esc(p.laboratorio)}</p>` : ''}
  </a>
  <div class="card__preco">
    ${desconto ? `<span class="card__de"><s>${brl(p.preco_maximo)}</s><span class="selo selo--desconto">-${pct}%</span></span>` : ''}
    <strong>${brl(p.preco)}</strong>
  </div>
  <div class="card__comprar">
    <div class="qtd-mini">
      <button type="button" data-qtd-passo="-1" aria-label="Diminuir quantidade">−</button>
      <input type="number" inputmode="numeric" min="1" max="${p.estoque}" value="1" aria-label="Quantidade de ${esc(p.nome)}">
      <button type="button" data-qtd-passo="1" aria-label="Aumentar quantidade">+</button>
    </div>
    <button type="button" class="btn btn--primario card__add" data-add-carrinho data-produto="${esc(JSON.stringify(carrinho))}">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6"/><path d="M14 2v6M11 5h6"/></svg>
      <span class="card__add-txt">Adicionar</span>
    </button>
  </div>
</article>`;
}
