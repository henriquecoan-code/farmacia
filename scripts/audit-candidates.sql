-- Auditoria rápida dos candidatos listados pelo usuário
-- Ajuste a lista abaixo se necessário
WITH candidates(rolname) AS (
  VALUES
    ('consulta'),
    ('sistema'),
    ('pod1'),
    ('integracao_fidelidade'),
    ('replicador'),
    ('pharmacy_ro'),
    ('postgres')
)

-- Resumo de privilégios por role
SELECT c.rolname,
       has_database_privilege(c.rolname, current_database(), 'CONNECT')                         AS can_connect,
       has_schema_privilege(c.rolname, 'public', 'USAGE')                                      AS usage_public,
       has_table_privilege(c.rolname, 'public.cadprodu',  'SELECT')                            AS sel_cadprodu,
       has_table_privilege(c.rolname, 'public.cadestoq',  'SELECT')                            AS sel_cadestoq,
       has_table_privilege(c.rolname, 'public.cadcddcb',  'SELECT')                            AS sel_cadcddcb,
       has_table_privilege(c.rolname, 'public.cadlabor',  'SELECT')                            AS sel_cadlabor,
       (
         SELECT bool_and(has_sequence_privilege(c.rolname, s.oid::regclass::text, 'SELECT'))
         FROM pg_class s
         JOIN pg_namespace n ON n.oid = s.relnamespace
         WHERE s.relkind = 'S' AND n.nspname = 'public'
       )                                                                                       AS select_all_sequences
FROM candidates c
ORDER BY rolname;

-- Para decidir rapidamente: procure um com todas as colunas = true (ou somente as tabelas = true, no mínimo)
