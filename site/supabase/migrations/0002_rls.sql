-- 0002_rls.sql — quem pode ler/gravar o quê.
-- Regra geral: o navegador (anon/authenticated) só faz o que estas políticas permitem;
-- o sync e as Edge Functions usam service_role (ignora RLS).

create function public.is_equipe() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid() and papel = 'admin')
$$;

alter table public.produtos           enable row level security;
alter table public.config_loja        enable row level security;
alter table public.admins             enable row level security;
alter table public.perfis             enable row level security;
alter table public.enderecos          enable row level security;
alter table public.pedidos            enable row level security;
alter table public.pedido_itens       enable row level security;
alter table public.pedido_status_log  enable row level security;
alter table public.pagamentos_eventos enable row level security;

-- Tira os privilégios padrão do Supabase e devolve só o necessário
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------------------------------------------------------------- catálogo
grant select on public.produtos_publicos to anon, authenticated;
-- tabela crua: só a equipe lê (vê bloqueios, ocultos etc.); escrita só via RPC admin_atualizar_produto
grant select on public.produtos to authenticated;
create policy produtos_equipe_le on public.produtos for select to authenticated using (public.is_equipe());

grant select on public.config_loja to anon, authenticated;
create policy config_le on public.config_loja for select to anon, authenticated using (true);
grant update on public.config_loja to authenticated;
create policy config_admin_altera on public.config_loja for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- equipe
grant select on public.admins to authenticated;
create policy admins_le on public.admins for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- inclusão/remoção de equipe: só pelo painel do Supabase (service_role)

-- ---------------------------------------------------------------- perfis
grant select, insert, update on public.perfis to authenticated;
create policy perfis_dono_le on public.perfis for select to authenticated
  using (user_id = auth.uid() or public.is_equipe());
create policy perfis_dono_cria on public.perfis for insert to authenticated
  with check (user_id = auth.uid());
create policy perfis_dono_altera on public.perfis for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- endereços
grant select, insert, update, delete on public.enderecos to authenticated;
create policy enderecos_dono on public.enderecos for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- pedidos
-- Cliente só CRIA pedido pela RPC criar_pedido (que calcula o total). Aqui só leitura.
grant select on public.pedidos, public.pedido_itens, public.pedido_status_log to authenticated;
create policy pedidos_le on public.pedidos for select to authenticated
  using (user_id = auth.uid() or public.is_equipe());
create policy itens_le on public.pedido_itens for select to authenticated
  using (exists (select 1 from public.pedidos p where p.id = pedido_id
                 and (p.user_id = auth.uid() or public.is_equipe())));
create policy status_log_le on public.pedido_status_log for select to authenticated
  using (exists (select 1 from public.pedidos p where p.id = pedido_id
                 and (p.user_id = auth.uid() or public.is_equipe())));
-- mudança de status pela equipe: RPC admin_mudar_status

-- ---------------------------------------------------------------- pagamentos (só admin lê)
grant select on public.pagamentos_eventos to authenticated;
create policy pag_eventos_admin on public.pagamentos_eventos for select to authenticated
  using (public.is_admin());
