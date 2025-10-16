-- Template: Conceder acesso SOMENTE LEITURA no schema public
-- IMPORTANTE: Seu banco tem uma proteção de DDL (event trigger) que exige abrir uma "sessão de manutenção" com um ticket.
-- Se você executar GRANT/ALTER sem iniciar a manutenção, verá erro como:
--   "Sessao de manutencao nao iniciada ou ticket invalido/expirado. Comando negado: GRANT"
-- Proceda assim:
-- 1) Abra a sessão de manutenção seguindo o procedimento do fornecedor/DBA (função e "ticket" variam por ambiente)
--    Remova os comentários da linha correspondente e substitua <...>:
--    Ex.: SELECT public.inicia_manutencao('<TICKET>');
--    ou   SELECT internal.sp_open_maintenance('<TICKET>');
--    ou   SELECT <schema>.<funcao_iniciar_manutencao>('<TICKET>');
-- 2) Execute os GRANTs abaixo (ajuste <db_name>, <ro_user>, e confirme que as tabelas estão no schema public)
-- 3) Encerre a sessão de manutenção
--    Ex.: SELECT <funcao_encerrar_manutencao>('<ticket>');

-- Opcional: Verificar os event triggers que bloqueiam DDL
-- SELECT evtname, evtenabled, evttags, evtenabled, evtfoid::regproc
-- FROM pg_event_trigger
-- ORDER BY evtname;

-- Opcional: Procurar funções possivelmente relacionadas a manutenção/ticket
-- SELECT n.nspname, p.proname
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE p.proname ILIKE '%manuten%' OR p.proname ILIKE '%maint%' OR p.proname ILIKE '%ticket%'
-- ORDER BY 1,2;

-- (Opcional) Ajustar search_path do usuário de leitura, se desejar, fora da sessão:
--   ALTER ROLE <ro_user> SET search_path = public;

BEGIN;

-- INÍCIO DA MANUTENÇÃO (remova os comentários ao usar)
-- SELECT <schema>.<funcao_iniciar_manutencao>('<TICKET>');

-- 1) Garantir que o usuário consegue conectar ao banco
-- GRANT CONNECT ON DATABASE <db_name> TO <ro_user>;

-- 2) Acesso ao schema public
GRANT USAGE ON SCHEMA public TO <ro_user>;

-- 3) Leitura nas tabelas necessárias (ajuste se o schema for outro)
GRANT SELECT ON TABLE public.cadprodu TO <ro_user>;
GRANT SELECT ON TABLE public.cadestoq TO <ro_user>;
GRANT SELECT ON TABLE public.cadcddcb TO <ro_user>;
GRANT SELECT ON TABLE public.cadlabor TO <ro_user>;

-- Alternativa: liberar leitura para todas as tabelas do schema public
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO <ro_user>;

-- 4) (Recomendado) Leitura em sequências do schema public
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO <ro_user>;

-- 5) (Opcional) Privilégios padrão para objetos FUTUROS criados pelo <owner>
-- ALTER DEFAULT PRIVILEGES FOR USER <owner> IN SCHEMA public GRANT SELECT ON TABLES TO <ro_user>;
-- ALTER DEFAULT PRIVILEGES FOR USER <owner> IN SCHEMA public GRANT SELECT ON SEQUENCES TO <ro_user>;

-- FIM DA MANUTENÇÃO (remova os comentários ao usar)
-- SELECT <schema>.<funcao_encerrar_manutencao>('<TICKET>');

COMMIT;

-- Após concluir:
--   - Testar com o usuário de leitura:
--       SELECT count(*) FROM public.cadprodu;
--       SELECT count(*) FROM public.cadestoq;
--   - Se falhar, confirme: owner das tabelas, schema correto, search_path e se a sessão de manutenção estava ativa.
