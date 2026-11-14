// Login no navegador (Supabase Auth) e utilidades das páginas de conta/checkout.
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
export const VERSAO_POLITICA = '2026-11';

export function cliente() {
  if (!supabase) throw new Error('Supabase não configurado (.env).');
  return supabase;
}

export async function usuarioAtual(): Promise<User | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

/** Garante login; sem sessão, manda para /entrar/ e volta depois. */
export async function exigirLogin(): Promise<User> {
  const u = await usuarioAtual();
  if (!u) {
    const volta = location.pathname.replace(BASE, '') + location.search;
    location.replace(`${BASE}/entrar/?volta=${encodeURIComponent(volta)}`);
    throw new Error('redirecionando para login');
  }
  return u;
}

/** Só aceita caminhos internos no ?volta= (evita redirecionar para outro site). */
export function destinoVolta(padrao = '/conta/') {
  const v = new URLSearchParams(location.search).get('volta') || padrao;
  return v.startsWith('/') && !v.startsWith('//') ? `${BASE}${v}` : `${BASE}${padrao}`;
}

export const brl = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Mensagens das funções do banco (raise exception) e do Supabase Auth em português. */
export function mensagemErro(e: unknown): string {
  const m = String((e as any)?.message ?? e ?? '');
  const tabela: [RegExp, string][] = [
    [/Invalid login credentials/i, 'E-mail ou senha incorretos.'],
    [/Email not confirmed/i, 'Confirme seu e-mail pelo link que enviamos antes de entrar.'],
    [/User already registered/i, 'Já existe uma conta com este e-mail. Use "Entrar" ou "Esqueci a senha".'],
    [/Password should be at least/i, 'A senha precisa ter pelo menos 8 caracteres.'],
    [/rate limit|too many/i, 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'],
    [/produto_indisponivel:(\d+)/, 'Um dos produtos não está mais disponível. Revise o carrinho.'],
    [/estoque_insuficiente:(\d+):(\d+)/, 'A quantidade pedida de um produto é maior que o estoque atual. Revise o carrinho.'],
    [/declaracao_receita_necessaria/, 'Marque a declaração de que possui a receita dos medicamentos de prescrição.'],
    [/endereco_invalido/, 'Escolha um endereço de entrega.'],
    [/retirada_indisponivel/, 'Retirada na loja indisponível no momento.'],
    [/carrinho_vazio/, 'Selecione ao menos um produto.'],
    [/parcelas_invalidas|parcela_abaixo_minimo/, 'Número de parcelas inválido para este valor.'],
    [/pedido_em_andamento/, 'Você tem pedido em andamento. Aguarde a entrega (ou cancele) antes de excluir a conta.'],
    [/nao_pode_cancelar/, 'Este pedido não pode mais ser cancelado pelo site. Fale com a farmácia.'],
    [/login_necessario|JWT|not authenticated/i, 'Sua sessão expirou. Entre novamente.'],
    [/Failed to fetch|NetworkError/i, 'Sem conexão. Verifique a internet e tente de novo.'],
  ];
  for (const [re, txt] of tabela) if (re.test(m)) return txt;
  return 'Não foi possível concluir agora. Tente de novo em instantes.';
}

export const STATUS_PEDIDO: Record<string, string> = {
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pago',
  separando: 'Em separação',
  enviado: 'Saiu para entrega',
  pronto_retirada: 'Pronto para retirada',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};
/** Pedido "pagar na entrega" ainda não pago aparece como recebido, não como "aguardando pagamento". */
export const rotuloStatus = (status: string, pagamento?: string) =>
  status === 'aguardando_pagamento' && pagamento === 'na_entrega' ? 'Recebido' : (STATUS_PEDIDO[status] ?? status);

export const NOME_PAGAMENTO: Record<string, string> = {
  pix: 'Pix', cartao_online: 'Cartão (online)', na_entrega: 'Na entrega / retirada',
};
export const NOME_ENTREGA: Record<string, string> = {
  padrao: 'Entrega padrão', expresso: 'Entrega expressa', retirada: 'Retirada na loja',
};
