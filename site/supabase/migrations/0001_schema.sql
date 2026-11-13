-- 0001_schema.sql — tabelas do site novo (Supabase / Postgres 15+)
-- O ERP da farmácia NÃO é este banco: aqui chega só uma cópia dos produtos, gravada pelo sync.

-- ---------------------------------------------------------------- produtos
create table public.produtos (
  cod_red           bigint primary key,            -- cod_reduzido do ERP
  slug              text not null unique,
  -- campos vindos do ERP (o sync sobrescreve)
  nome              text not null,
  dcb               text,
  laboratorio       text,
  ean               text,
  categoria         text not null,
  cod_grupo         integer,
  preco_maximo      numeric(10,2) not null check (preco_maximo >= 0),
  preco             numeric(10,2) not null check (preco >= 0),
  estoque           integer not null default 0,
  tipo_venda        text not null default 'prescricao' check (tipo_venda in ('mip','prescricao')),
  pendente          boolean not null default false,     -- bloqueado pelas regras de config/product-filters.json
  motivos_bloqueio  text[] not null default '{}',
  erp_atualizado_em timestamptz not null default now(),
  -- campos editoriais (só o admin altera; o sync nunca toca)
  publicado         boolean not null default true,      -- ocultar manualmente
  liberado_manual   boolean not null default false,     -- admin liberou mesmo com bloqueio
  tipo_venda_manual text check (tipo_venda_manual in ('mip','prescricao')), -- correção do admin
  descricao         text,
  destaque          boolean not null default false,
  fotos             text[] not null default '{}',
  editado_em        timestamptz
);
create index produtos_categoria_idx on public.produtos (categoria);

-- Visível na loja: publicado, não bloqueado (ou liberado), com estoque.
-- A view roda com os direitos do dono, então expõe só estas colunas ao público.
create view public.produtos_publicos as
select
  p.cod_red, p.slug, p.nome, p.dcb, p.laboratorio, p.ean, p.categoria,
  p.preco_maximo, p.preco, p.estoque,
  coalesce(p.tipo_venda_manual, p.tipo_venda) as tipo_venda,
  -- RDC 96/2008: medicamento de prescrição não vai para destaque/promoção
  (p.destaque and coalesce(p.tipo_venda_manual, p.tipo_venda) = 'mip') as destaque,
  p.descricao, p.fotos,
  greatest(p.erp_atualizado_em, coalesce(p.editado_em, p.erp_atualizado_em)) as atualizado_em
from public.produtos p
where p.publicado
  and (not p.pendente or p.liberado_manual)
  and p.estoque > 0;

-- ---------------------------------------------------------------- configuração da loja (1 linha)
create table public.config_loja (
  id                   boolean primary key default true check (id),
  frete_padrao         numeric(10,2) not null default 9.90,
  frete_expresso       numeric(10,2) not null default 24.90,
  frete_gratis_acima   numeric(10,2),                -- null = sem frete grátis
  retirada_habilitada  boolean not null default true,
  parcelas_max         integer not null default 3 check (parcelas_max between 1 and 12),
  parcela_minima       numeric(10,2) not null default 30.00,
  politica_versao      text not null default '2026-11'
);
insert into public.config_loja default values;

-- ---------------------------------------------------------------- equipe
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  papel   text not null default 'atendente' check (papel in ('admin','atendente')),
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------- clientes
create table public.perfis (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  nome             text,
  telefone         text,
  aceite_politica_versao text,
  aceite_politica_em     timestamptz,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

create table public.enderecos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  apelido      text,
  cep          text not null,
  logradouro   text not null,
  numero       text not null,
  complemento  text,
  bairro       text not null,
  cidade       text not null,
  uf           char(2) not null,
  criado_em    timestamptz not null default now()
);
create index enderecos_user_idx on public.enderecos (user_id);

-- ---------------------------------------------------------------- pedidos
create sequence public.pedidos_numero_seq start 1001;

create table public.pedidos (
  id               uuid primary key default gen_random_uuid(),
  numero           bigint not null unique default nextval('public.pedidos_numero_seq'),
  user_id          uuid references auth.users(id) on delete set null,  -- null após exclusão da conta
  status           text not null default 'aguardando_pagamento' check (status in
                     ('aguardando_pagamento','pago','separando','enviado','pronto_retirada','entregue','cancelado')),
  pagamento        text not null check (pagamento in ('pix','cartao_online','na_entrega')),
  parcelas         integer not null default 1 check (parcelas between 1 and 12),
  entrega          text not null check (entrega in ('padrao','expresso','retirada')),
  subtotal         numeric(10,2) not null,
  frete            numeric(10,2) not null,
  total            numeric(10,2) not null,
  -- cópia do endereço e contato no momento do pedido
  cliente_nome     text,
  cliente_telefone text,
  cliente_email    text,
  endereco         jsonb,
  tem_prescricao   boolean not null default false,
  declarou_receita boolean not null default false,
  observacao       text,
  pix_txid         text unique,
  mp_payment_id    text unique,
  pagamento_status text,
  pago_em          timestamptz,
  anonimizado      boolean not null default false,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create index pedidos_user_idx on public.pedidos (user_id, criado_em desc);
create index pedidos_status_idx on public.pedidos (status, criado_em);

create table public.pedido_itens (
  pedido_id   uuid not null references public.pedidos(id) on delete cascade,
  cod_red     bigint not null,
  nome        text not null,
  tipo_venda  text not null,
  quantidade  integer not null check (quantidade > 0),
  preco_unit  numeric(10,2) not null,
  total       numeric(10,2) not null,
  primary key (pedido_id, cod_red)
);

create table public.pedido_status_log (
  id         bigserial primary key,
  pedido_id  uuid not null references public.pedidos(id) on delete cascade,
  de         text,
  para       text not null,
  por        uuid,
  em         timestamptz not null default now()
);

-- Log bruto dos webhooks de pagamento (auditoria). Só service_role/admin.
create table public.pagamentos_eventos (
  id         bigserial primary key,
  provedor   text not null check (provedor in ('sicredi','mercadopago')),
  referencia text,
  payload    jsonb not null,
  recebido_em timestamptz not null default now()
);

-- ---------------------------------------------------------------- gatilhos utilitários
create function public.tg_set_atualizado_em() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;

create trigger perfis_atualizado before update on public.perfis
  for each row execute function public.tg_set_atualizado_em();
create trigger pedidos_atualizado before update on public.pedidos
  for each row execute function public.tg_set_atualizado_em();

create function public.tg_log_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.pedido_status_log (pedido_id, de, para, por)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid());
  end if;
  return new;
end $$;
create trigger pedidos_status_log after insert or update of status on public.pedidos
  for each row execute function public.tg_log_status();

-- Cria o perfil vazio quando alguém se cadastra
create function public.tg_novo_usuario() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (user_id, nome, aceite_politica_versao, aceite_politica_em)
  values (
    new.id,
    new.raw_user_meta_data->>'nome',
    new.raw_user_meta_data->>'aceite_politica_versao',
    case when new.raw_user_meta_data ? 'aceite_politica_versao' then now() end
  )
  on conflict (user_id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.tg_novo_usuario();
