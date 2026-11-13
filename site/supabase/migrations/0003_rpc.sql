-- 0003_rpc.sql — operações que o navegador chama. Todas recalculam/validam no servidor.

-- ---------------------------------------------------------------- criar_pedido
-- p_itens: [{"cod_red": 123, "quantidade": 2}, ...]  (preço enviado pelo navegador é ignorado)
create function public.criar_pedido(
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

  if v_presc and not coalesce(p_declarou_receita, false) then
    raise exception 'declaracao_receita_necessaria';
  end if;

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

-- ---------------------------------------------------------------- cliente cancela pedido não pago
create function public.cancelar_meu_pedido(p_pedido_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.pedidos set status = 'cancelado'
   where id = p_pedido_id and user_id = auth.uid() and status = 'aguardando_pagamento';
  if not found then raise exception 'nao_pode_cancelar'; end if;
end $$;

-- ---------------------------------------------------------------- equipe: status do pedido
create function public.admin_mudar_status(p_pedido_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare v_atual text;
begin
  if not public.is_equipe() then raise exception 'sem_permissao' using errcode = '42501'; end if;
  select status into v_atual from public.pedidos where id = p_pedido_id for update;
  if not found then raise exception 'pedido_inexistente'; end if;
  if not (
    (v_atual = 'aguardando_pagamento' and p_status in ('pago','separando','cancelado')) or
    (v_atual = 'pago'                 and p_status in ('separando','cancelado')) or
    (v_atual = 'separando'            and p_status in ('enviado','pronto_retirada','cancelado')) or
    (v_atual in ('enviado','pronto_retirada') and p_status in ('entregue','cancelado'))
  ) then
    raise exception 'transicao_invalida:%->%', v_atual, p_status;
  end if;
  update public.pedidos set status = p_status,
         pago_em = case when p_status = 'pago' and pago_em is null then now() else pago_em end
   where id = p_pedido_id;
end $$;

-- ---------------------------------------------------------------- equipe: campos editoriais do produto
-- Preço, estoque e nome vêm do ERP e não são alteráveis aqui.
create function public.admin_atualizar_produto(p_cod_red bigint, p_dados jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_equipe() then raise exception 'sem_permissao' using errcode = '42501'; end if;
  update public.produtos set
    publicado         = coalesce((p_dados->>'publicado')::boolean, publicado),
    liberado_manual   = coalesce((p_dados->>'liberado_manual')::boolean, liberado_manual),
    destaque          = coalesce((p_dados->>'destaque')::boolean, destaque),
    descricao         = case when p_dados ? 'descricao' then nullif(left(p_dados->>'descricao', 5000), '') else descricao end,
    fotos             = case when p_dados ? 'fotos' then array(select jsonb_array_elements_text(p_dados->'fotos')) else fotos end,
    tipo_venda_manual = case when p_dados ? 'tipo_venda_manual' then p_dados->>'tipo_venda_manual' else tipo_venda_manual end,
    editado_em        = now()
  where cod_red = p_cod_red;
  if not found then raise exception 'produto_inexistente'; end if;
end $$;

-- ---------------------------------------------------------------- LGPD
create function public.exportar_meus_dados() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'gerado_em', now(),
    'conta', (select jsonb_build_object('email', u.email, 'criado_em', u.created_at) from auth.users u where u.id = auth.uid()),
    'perfil', (select to_jsonb(p) - 'user_id' from public.perfis p where p.user_id = auth.uid()),
    'enderecos', coalesce((select jsonb_agg(to_jsonb(e) - 'user_id') from public.enderecos e where e.user_id = auth.uid()), '[]'),
    'pedidos', coalesce((
      select jsonb_agg(to_jsonb(pd) - 'user_id' || jsonb_build_object('itens',
               (select jsonb_agg(to_jsonb(i) - 'pedido_id') from public.pedido_itens i where i.pedido_id = pd.id))
             order by pd.criado_em)
      from public.pedidos pd where pd.user_id = auth.uid()), '[]')
  )
$$;

-- Apaga conta, perfil e endereços; pedidos ficam anonimizados (guarda fiscal/sanitária).
create function public.excluir_minha_conta() returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'login_necessario'; end if;
  if exists (select 1 from public.pedidos where user_id = v_uid
             and status in ('pago','separando','enviado','pronto_retirada')) then
    raise exception 'pedido_em_andamento';
  end if;
  update public.pedidos set status = 'cancelado' where user_id = v_uid and status = 'aguardando_pagamento';
  update public.pedidos set
    user_id = null, cliente_nome = null, cliente_telefone = null, cliente_email = null,
    endereco = case when endereco is null then null
                    else jsonb_build_object('cidade', endereco->>'cidade', 'uf', endereco->>'uf') end,
    observacao = null, anonimizado = true
  where user_id = v_uid;
  delete from public.enderecos where user_id = v_uid;
  delete from public.perfis where user_id = v_uid;
  delete from auth.users where id = v_uid;
end $$;

-- ---------------------------------------------------------------- permissões de execução
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.criar_pedido(jsonb, text, text, uuid, integer, boolean, text) to authenticated;
grant execute on function public.cancelar_meu_pedido(uuid) to authenticated;
grant execute on function public.admin_mudar_status(uuid, text) to authenticated;
grant execute on function public.admin_atualizar_produto(bigint, jsonb) to authenticated;
grant execute on function public.exportar_meus_dados() to authenticated;
grant execute on function public.excluir_minha_conta() to authenticated;
grant execute on function public.is_equipe() to authenticated;
grant execute on function public.is_admin() to authenticated;
