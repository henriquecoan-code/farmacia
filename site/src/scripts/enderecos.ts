// Endereços do cliente (tabela enderecos, protegida por RLS) + preenchimento pelo CEP (ViaCEP).
import { cliente, esc } from './sessao';

export interface Endereco {
  id: string;
  apelido: string | null;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
}

export async function listarEnderecos(): Promise<Endereco[]> {
  const { data, error } = await cliente().from('enderecos')
    .select('id, apelido, cep, logradouro, numero, complemento, bairro, cidade, uf')
    .order('criado_em', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function salvarEndereco(userId: string, e: Omit<Endereco, 'id'>, id?: string): Promise<Endereco> {
  const linha = { ...e, user_id: userId };
  const q = id
    ? cliente().from('enderecos').update(linha).eq('id', id)
    : cliente().from('enderecos').insert(linha);
  const { data, error } = await q.select('id, apelido, cep, logradouro, numero, complemento, bairro, cidade, uf').single();
  if (error) throw error;
  return data as Endereco;
}

export async function excluirEndereco(id: string) {
  const { error } = await cliente().from('enderecos').delete().eq('id', id);
  if (error) throw error;
}

export const resumoEndereco = (e: Endereco) =>
  `${e.logradouro}, ${e.numero}${e.complemento ? ` - ${e.complemento}` : ''} · ${e.bairro} · ${e.cidade}/${e.uf} · CEP ${e.cep}`;

/** HTML do formulário de endereço (mesmo nos dois lugares: conta e checkout). */
export const formEnderecoHTML = (e?: Partial<Endereco>) => `
  <div class="linha-2">
    <label class="campo"><span>CEP</span><input name="cep" inputmode="numeric" autocomplete="postal-code" required maxlength="9" value="${esc(e?.cep)}" placeholder="00000-000"></label>
    <label class="campo"><span>Apelido <small>(opcional)</small></span><input name="apelido" value="${esc(e?.apelido)}" placeholder="Casa, trabalho…"></label>
  </div>
  <label class="campo"><span>Rua</span><input name="logradouro" autocomplete="address-line1" required value="${esc(e?.logradouro)}"></label>
  <div class="linha-2">
    <label class="campo"><span>Número</span><input name="numero" required value="${esc(e?.numero)}"></label>
    <label class="campo"><span>Complemento</span><input name="complemento" value="${esc(e?.complemento)}"></label>
  </div>
  <div class="linha-3">
    <label class="campo"><span>Bairro</span><input name="bairro" required value="${esc(e?.bairro)}"></label>
    <label class="campo"><span>Cidade</span><input name="cidade" autocomplete="address-level2" required value="${esc(e?.cidade)}"></label>
    <label class="campo"><span>UF</span><input name="uf" autocomplete="address-level1" required maxlength="2" value="${esc(e?.uf)}"></label>
  </div>`;

export function lerFormEndereco(form: HTMLFormElement): Omit<Endereco, 'id'> {
  const d = new FormData(form);
  const s = (k: string) => String(d.get(k) ?? '').trim();
  return {
    apelido: s('apelido') || null,
    cep: s('cep').replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2'),
    logradouro: s('logradouro'),
    numero: s('numero'),
    complemento: s('complemento') || null,
    bairro: s('bairro'),
    cidade: s('cidade'),
    uf: s('uf').toUpperCase(),
  };
}

/** Ao digitar o CEP completo, preenche rua/bairro/cidade/UF pelo ViaCEP (só o CEP é enviado). */
export function ligarCep(form: HTMLElement) {
  const cep = form.querySelector<HTMLInputElement>('input[name=cep]');
  if (!cep) return;
  cep.addEventListener('input', async () => {
    const n = cep.value.replace(/\D/g, '');
    if (n.length === 8) cep.value = `${n.slice(0, 5)}-${n.slice(5)}`;
    if (n.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${n}/json/`);
      const j = await r.json();
      if (j.erro) return;
      const set = (nome: string, v: string) => {
        const el = form.querySelector<HTMLInputElement>(`input[name=${nome}]`);
        if (el && v && !el.value) el.value = v;
      };
      set('logradouro', j.logradouro); set('bairro', j.bairro); set('cidade', j.localidade); set('uf', j.uf);
      form.querySelector<HTMLInputElement>('input[name=numero]')?.focus();
    } catch { /* sem internet: o cliente preenche à mão */ }
  });
}
