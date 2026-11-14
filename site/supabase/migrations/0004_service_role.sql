-- 0004_service_role.sql — permissões do service_role (Edge Functions de pagamento, admin do servidor).
-- O projeto é criado com "Automatically expose new tables" DESLIGADO, então nenhum papel ganha
-- acesso automático: anon/authenticated recebem só o que 0002/0003 concedem; aqui o service_role.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
