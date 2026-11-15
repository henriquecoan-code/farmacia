-- 0006_admin_fotos.sql — painel da equipe: fotos de produtos no Supabase Storage + resumo de pedidos.
-- A parte de Storage só roda no Supabase (o schema "storage" não existe no banco de testes).

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    -- bucket público: as fotos aparecem no site; só imagens, até 3 MB
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('fotos', 'fotos', true, 3145728, array['image/webp', 'image/jpeg', 'image/png'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

    -- leitura pública vem do bucket público; escrita só da equipe
    execute $p$ drop policy if exists fotos_equipe_insere on storage.objects $p$;
    execute $p$ create policy fotos_equipe_insere on storage.objects for insert to authenticated
                with check (bucket_id = 'fotos' and public.is_equipe()) $p$;
    execute $p$ drop policy if exists fotos_equipe_altera on storage.objects $p$;
    execute $p$ create policy fotos_equipe_altera on storage.objects for update to authenticated
                using (bucket_id = 'fotos' and public.is_equipe()) with check (bucket_id = 'fotos' and public.is_equipe()) $p$;
    execute $p$ drop policy if exists fotos_equipe_apaga on storage.objects $p$;
    execute $p$ create policy fotos_equipe_apaga on storage.objects for delete to authenticated
                using (bucket_id = 'fotos' and public.is_equipe()) $p$;
    execute $p$ drop policy if exists fotos_equipe_le on storage.objects $p$;
    execute $p$ create policy fotos_equipe_le on storage.objects for select to authenticated
                using (bucket_id = 'fotos' and public.is_equipe()) $p$;
  end if;
end $$;

-- Contagem de pedidos por status para o painel (só equipe)
create function public.admin_resumo_pedidos() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_equipe() then coalesce(jsonb_object_agg(status, n), '{}'::jsonb) else null end
  from (select status, count(*)::int n from public.pedidos group by status) t
$$;
revoke execute on function public.admin_resumo_pedidos() from public, anon;
grant execute on function public.admin_resumo_pedidos() to authenticated, service_role;
