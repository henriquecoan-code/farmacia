// Painel da equipe: só entra quem está na tabela admins (o RLS do banco garante o resto).
import { cliente, exigirLogin, BASE } from './sessao';

export async function exigirEquipe() {
  const user = await exigirLogin();
  const { data, error } = await cliente().rpc('is_equipe');
  if (error || data !== true) {
    document.querySelector('[data-admin-conteudo]')?.remove();
    const aviso = document.querySelector<HTMLElement>('[data-admin-negado]');
    if (aviso) aviso.hidden = false;
    throw new Error('sem permissão de equipe');
  }
  document.querySelector<HTMLElement>('[data-admin-carregando]')?.setAttribute('hidden', '');
  document.querySelector<HTMLElement>('[data-admin-conteudo]')?.removeAttribute('hidden');
  return user;
}

export const urlAdmin = (p: string) => `${BASE}/admin${p}`;

/** Próximos status possíveis (espelha admin_mudar_status no banco). */
export function proximosStatus(status: string, entrega: string): { para: string; rotulo: string; perigo?: boolean }[] {
  const saida = entrega === 'retirada'
    ? { para: 'pronto_retirada', rotulo: 'Pronto para retirada' }
    : { para: 'enviado', rotulo: 'Saiu para entrega' };
  const cancelar = { para: 'cancelado', rotulo: 'Cancelar pedido', perigo: true };
  switch (status) {
    case 'aguardando_pagamento': return [{ para: 'separando', rotulo: 'Iniciar separação' }, { para: 'pago', rotulo: 'Marcar como pago' }, cancelar];
    case 'pago': return [{ para: 'separando', rotulo: 'Iniciar separação' }, cancelar];
    case 'separando': return [saida, cancelar];
    case 'enviado':
    case 'pronto_retirada': return [{ para: 'entregue', rotulo: 'Marcar como entregue' }, cancelar];
    default: return [];
  }
}
