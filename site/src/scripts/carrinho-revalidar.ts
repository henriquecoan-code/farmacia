// Confere o carrinho com a view pública do banco (preço, estoque, tipo de venda).
import { supabase } from '../lib/supabase';
import { lerCarrinho, salvar } from './carrinho';

/** Confere preço/estoque atuais no banco. Retorna true se algo mudou. */
export async function revalidar(): Promise<boolean> {
  const itens = lerCarrinho();
  if (!itens.length || !supabase) return false;
  const { data, error } = await supabase
    .from('produtos_publicos')
    .select('cod_red, preco, estoque, tipo_venda, nome, slug')
    .in('cod_red', itens.map((i) => i.cod_red));
  if (error || !data) return false;
  const atual = new Map(data.map((d: any) => [Number(d.cod_red), d]));
  let mudou = false;
  for (const it of itens) {
    const d: any = atual.get(it.cod_red);
    if (!d || d.estoque <= 0) {
      if (!it.indisponivel) { it.indisponivel = true; mudou = true; }
      continue;
    }
    if (it.indisponivel) { it.indisponivel = false; mudou = true; }
    const preco = Number(d.preco);
    if (Math.abs(preco - it.preco) > 0.004) { it.preco_anterior = it.preco; it.preco = preco; mudou = true; }
    if (d.estoque !== it.estoque) { it.estoque = d.estoque; mudou = true; }
    if (it.quantidade > d.estoque) { it.quantidade = d.estoque; mudou = true; }
    if (d.tipo_venda !== it.tipo_venda) { it.tipo_venda = d.tipo_venda; mudou = true; }
  }
  if (mudou) salvar(itens);
  return mudou;
}

