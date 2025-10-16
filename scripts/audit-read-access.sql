-- Auditoria de usuários/roles com acesso de leitura às tabelas necessárias
-- Objetivo: identificar um LOGIN role existente que já possua os privilégios
-- exigidos para nossos scripts (CONNECT no DB, USAGE no schema public, SELECT
-- nas tabelas alvo, e SELECT em sequências do schema public).

-- Ajuste o schema/tabelas se necessário (assumimos public.*)
\echo ==== Contexto da sessão
SELECT current_database() AS db, current_user, session_user, now() AS ts;

\echo ==== Lista de roles com login
WITH roles AS (
  SELECT r.oid, r.rolname, r.rolcanlogin, r.rolsuper, r.rolinherit
  FROM pg_roles r
  WHERE r.rolcanlogin
)
SELECT * FROM roles ORDER BY rolname;

\echo ==== Memberships (quem pertence a quem)
SELECT m.roleid::regrole AS role, m.member::regrole AS member, m.admin_option
FROM pg_auth_members m
ORDER BY 1,2;

\echo ==== Privilégios no banco atual (CONNECT)
WITH roles AS (
  SELECT r.rolname FROM pg_roles r WHERE r.rolcanlogin
)
SELECT r.rolname,
       has_database_privilege(r.rolname, current_database(), 'CONNECT') AS can_connect
FROM roles r
ORDER BY rolname;

\echo ==== Privilégios no schema public (USAGE)
WITH roles AS (
  SELECT r.rolname FROM pg_roles r WHERE r.rolcanlogin
)
SELECT r.rolname,
       has_schema_privilege(r.rolname, 'public', 'USAGE') AS usage_public
FROM roles r
ORDER BY rolname;

\echo ==== Privilégios de SELECT nas tabelas alvo
WITH roles AS (
  SELECT r.rolname FROM pg_roles r WHERE r.rolcanlogin
)
SELECT r.rolname,
       has_table_privilege(r.rolname, 'public.cadprodu',  'SELECT') AS sel_cadprodu,
       has_table_privilege(r.rolname, 'public.cadestoq',  'SELECT') AS sel_cadestoq,
       has_table_privilege(r.rolname, 'public.cadcddcb',  'SELECT') AS sel_cadcddcb,
       has_table_privilege(r.rolname, 'public.cadlabor',  'SELECT') AS sel_cadlabor
FROM roles r
ORDER BY rolname;

\echo ==== Privilégios em sequências do schema public (SELECT)
WITH roles AS (
  SELECT r.rolname FROM pg_roles r WHERE r.rolcanlogin
), seqs AS (
  SELECT c.oid::regclass AS seqname
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'S' AND n.nspname = 'public'
), checks AS (
  SELECT r.rolname, s.seqname,
         has_sequence_privilege(r.rolname, s.seqname::text, 'SELECT') AS can_select
  FROM roles r CROSS JOIN seqs s
)
SELECT rolname,
       bool_and(can_select) AS select_all_sequences,
       count(*) FILTER (WHERE NOT can_select) AS missing_seq_perms
FROM checks
GROUP BY rolname
ORDER BY rolname;

\echo ==== Candidatos com todos os requisitos (visão geral)
WITH roles AS (
  SELECT r.rolname FROM pg_roles r WHERE r.rolcanlogin
), t AS (
  SELECT r.rolname,
         has_database_privilege(r.rolname, current_database(), 'CONNECT') AS can_connect,
         has_schema_privilege(r.rolname, 'public', 'USAGE') AS usage_public,
         has_table_privilege(r.rolname, 'public.cadprodu',  'SELECT') AS sel_cadprodu,
         has_table_privilege(r.rolname, 'public.cadestoq',  'SELECT') AS sel_cadestoq,
         has_table_privilege(r.rolname, 'public.cadcddcb',  'SELECT') AS sel_cadcddcb,
         has_table_privilege(r.rolname, 'public.cadlabor',  'SELECT') AS sel_cadlabor
  FROM roles r
)
SELECT *,
       (can_connect AND usage_public AND sel_cadprodu AND sel_cadestoq AND sel_cadcddcb AND sel_cadlabor) AS all_ok
FROM t
ORDER BY all_ok DESC, rolname;

\echo ==== Dica: Testar com um candidato
-- Em outra sessão/conexão, conecte como o rol escolhido e rode:
--   SELECT count(*) FROM public.cadprodu;
--   SELECT count(*) FROM public.cadestoq;
--   SELECT count(*) FROM public.cadcddcb;
--   SELECT count(*) FROM public.cadlabor;
