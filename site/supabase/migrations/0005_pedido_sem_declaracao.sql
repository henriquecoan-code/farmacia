-- 0005_pedido_sem_declaracao.sql — por decisão da farmácia, o checkout não pede mais a declaração
-- de receita. O pedido continua marcando tem_prescricao (a equipe confere a receita na entrega/retirada).
-- p_declarou_receita fica na assinatura por compatibilidade, mas não é mais exigido.
create or replace function public.criar_pedido(
  p_itens            jsonb,
  p_entrega          text,
  p_pagamento        text,
  p_endereco_id      uuid    default null,
  p_parcelas         integer default 1,
  p_declarou_receita boolean default false,
  p_observacao       text    default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_cfg       public.config_loja;
  v_perfil    public.perfis;
  v_end       public.enderecos;
  v_item      jsonb;
  v_prod      record;
  v_qtd       integer;
  v_subtotal  numeric(10,2) := 0;
  v_frete     numeric(10,2);
  v_total     numeric(10,2);
  v_presc     boolean := false;
  v_pedido_id uuid;
  v_numero    bigint;
  v_linhas    jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'login_necessario' using errcode = '28000'; end if;
  if p_entrega not in ('padrao','expresso','retirada') then raise exception 'entrega_invalida'; end if;
  if p_pagamento not in ('pix','cartao_online','na_entrega') then raise exception 'pagamento_invalido'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'carrinho_vazio'; end if;
  if jsonb_array_length(p_itens) > 100 then raise exception 'itens_demais'; end if;

  select * into v_cfg from public.config_loja;
  select * into v_perfil from public.perfis where user_id = v_uid;

  if p_entrega = 'retirada' then
    if not v_cfg.retirada_habilitada then raise exception 'retirada_indisponivel'; end if;
  else
    select * into v_end from public.enderecos where id = p_endereco_id and user_id = v_uid;
    if not found then raise exception 'endereco_invalido'; end if;
  end if;

  -- Itens: preço, estoque e tipo vêm do banco
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_item->>'quantidade')::integer;
    if v_qtd is null or v_qtd < 1 or v_qtd > 999 then raise exception 'quantidade_invalida'; end if;
    select * into v_prod from public.produtos_publicos where cod_red = (v_item->>'cod_red')::bigint;
    if not found then
      raise exception 'produto_indisponivel:%', v_item->>'cod_red';
    end if;
    if v_qtd > v_prod.estoque then
      raise exception 'estoque_insuficiente:%:%', v_prod.cod_red, v_prod.estoque;
    end if;
    if v_linhas @> jsonb_build_array(jsonb_build_object('cod_red', v_prod.cod_red)) then
      raise exception 'item_duplicado:%', v_prod.cod_red;
    end if;
    v_presc := v_presc or v_prod.tipo_venda = 'prescricao';
    v_subtotal := v_subtotal + round(v_prod.preco * v_qtd, 2);
    v_linhas := v_linhas || jsonb_build_array(jsonb_build_object(
      'cod_red', v_prod.cod_red, 'nome', v_prod.nome, 'tipo_venda', v_prod.tipo_venda,
      'quantidade', v_qtd, 'preco_unit', v_prod.preco, 'total', round(v_prod.preco * v_qtd, 2)));
  end loop;


  v_frete := case p_entrega
    when 'retirada' then 0
    when 'expresso' then v_cfg.frete_expresso
    else case when v_cfg.frete_gratis_acima is not null and v_subtotal >= v_cfg.frete_gratis_acima
              then 0 else v_cfg.frete_padrao end
  end;
  v_total := v_subtotal + v_frete;

  if p_pagamento = 'cartao_online' then
    if p_parcelas < 1 or p_parcelas > v_cfg.parcelas_max then raise exception 'parcelas_invalidas'; end if;
    if p_parcelas > 1 and v_total / p_parcelas < v_cfg.parcela_minima then raise exception 'parcela_abaixo_minimo'; end if;
  elsif p_parcelas <> 1 then
    raise exception 'parcelas_invalidas';
  end if;

  insert into public.pedidos (
    user_id, pagamento, parcelas, entrega, subtotal, frete, total,
    cliente_nome, cliente_telefone, cliente_email, endereco,
    tem_prescricao, declarou_receita, observacao
  ) values (
    v_uid, p_pagamento, p_parcelas, p_entrega, v_subtotal, v_frete, v_total,
    v_perfil.nome, v_perfil.telefone, (select email from auth.users where id = v_uid),
    case when p_entrega = 'retirada' then null else jsonb_build_object(
      'cep', v_end.cep, 'logradouro', v_end.logradouro, 'numero', v_end.numero,
      'complemento', v_end.complemento, 'bairro', v_end.bairro, 'cidade', v_end.cidade, 'uf', v_end.uf) end,
    v_presc, coalesce(p_declarou_receita, false) and v_presc, left(p_observacao, 500)
  ) returning id, numero into v_pedido_id, v_numero;

  insert into public.pedido_itens (pedido_id, cod_red, nome, tipo_venda, quantidade, preco_unit, total)
  select v_pedido_id, (l->>'cod_red')::bigint, l->>'nome', l->>'tipo_venda',
         (l->>'quantidade')::integer, (l->>'preco_unit')::numeric, (l->>'total')::numeric
  from jsonb_array_elements(v_linhas) l;

  return jsonb_build_object('id', v_pedido_id, 'numero', v_numero,
    'subtotal', v_subtotal, 'frete', v_frete, 'total', v_total, 'tem_prescricao', v_presc);
end $$;
