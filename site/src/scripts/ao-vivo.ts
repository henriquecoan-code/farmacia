// Página de produto: confere preço e estoque atuais no Supabase (o HTML foi gerado no último build).
import { supabase } from '../lib/supabase';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export async function atualizarAoVivo() {
  const art = document.querySelector<HTMLElement>('[data-cod-red]');
  if (!art || !supabase) return;
  const cod = Number(art.dataset.codRed);
  const { data, error } = await supabase
    .from('produtos_publicos')
    .select('preco, preco_maximo, estoque, tipo_venda')
    .eq('cod_red', cod)
    .maybeSingle();
  if (error) return; // mantém o que veio no HTML

  const precoEl = art.querySelector<HTMLElement>('[data-ao-vivo="preco"]');
  const estoqueEl = art.querySelector<HTMLElement>('[data-ao-vivo="estoque"]');
  const botao = art.querySelector<HTMLButtonElement>('[data-add-carrinho]');
  const qtd = art.querySelector<HTMLInputElement>('#qtd');

  if (!data || data.estoque <= 0) {
    if (estoqueEl) { estoqueEl.textContent = 'Indisponível no momento'; estoqueEl.classList.add('esgotado'); }
    if (botao) { botao.disabled = true; botao.textContent = 'Indisponível'; }
    return;
  }
  if (precoEl) precoEl.textContent = brl(Number(data.preco));
  const maxEl = art.querySelector<HTMLElement>('[data-ao-vivo="preco_maximo"]');
  if (maxEl) maxEl.textContent = brl(Number(data.preco_maximo));
  const pctEl = art.querySelector<HTMLElement>('[data-ao-vivo="percentual"]');
  if (pctEl && Number(data.preco_maximo) > 0) pctEl.textContent = `-${Math.round((1 - Number(data.preco) / Number(data.preco_maximo)) * 100)}%`;
  if (qtd) qtd.max = String(data.estoque);
  if (botao?.dataset.produto) {
    const dados = JSON.parse(botao.dataset.produto);
    botao.dataset.produto = JSON.stringify({ ...dados, preco: Number(data.preco), estoque: data.estoque, tipo_venda: data.tipo_venda });
  }
}
