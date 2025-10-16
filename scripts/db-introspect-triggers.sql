-- Inspeção de triggers e funções de DDL/Manutenção
-- Execute com um usuário que tenha permissão de SELECT nos catálogos (qualquer usuário comum deve conseguir).

-- 1) Listar event triggers ativos
SELECT evtname, evtevent, evtenabled, evttags, evtfoid::regproc AS function
FROM pg_event_trigger
ORDER BY evtname;

-- 2) Localizar a função fc_inspect_ddl (nome citado no erro)
SELECT n.nspname AS schema, p.proname AS function, p.oid::regprocedure AS signature
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'fc_inspect_ddl';

-- 3) Obter o corpo/definição da função fc_inspect_ddl (ajuste o schema se necessário)
-- Dica: copie o schema da query 2 e substitua abaixo.
-- Ex.: SELECT pg_get_functiondef('internal.fc_inspect_ddl(text)'::regprocedure);
-- Se não souber a assinatura, use assim:
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'fc_inspect_ddl';

-- 4) Procurar por funções com nomes relacionados a manutenção/ticket
SELECT n.nspname AS schema, p.proname AS function, p.oid::regprocedure AS signature
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname ILIKE '%manut%' OR p.proname ILIKE '%maint%' OR p.proname ILIKE '%ticket%'
ORDER BY 1,2;

-- 5) Procurar por funções que referenciam 'ticket' dentro do código
SELECT n.nspname AS schema, p.proname AS function
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE pg_get_functiondef(p.oid) ILIKE '%ticket%'
   OR pg_get_functiondef(p.oid) ILIKE '%manuten%'
   OR pg_get_functiondef(p.oid) ILIKE '%maintenance%'
ORDER BY 1,2;

-- 6) Dump das definições das funções de manutenção que encontramos em public
--    Ajuste o schema se necessário, mas pelos achados, estão em public
SELECT pg_get_functiondef('public.fc_gen_ticket_string(text,text)'::regprocedure);
SELECT pg_get_functiondef('public.fc_enable_maintenance(text,text)'::regprocedure);
SELECT pg_get_functiondef('public.fc_validate_ticket(text,text)'::regprocedure);
SELECT pg_get_functiondef('public.fc_validate_ticket()'::regprocedure);
SELECT pg_get_functiondef('public.fc_strict_validate_ticket()'::regprocedure);

-- 7) Contexto da sessão (útil para depuração)
SELECT current_user, session_user, inet_client_addr() AS client_ip, now() AS ts;
