-- Habilitar manutenção e conceder leitura ao usuário pharmacy_ro
-- Execute este script na MESMA SESSÃO/CONEXÃO, sem BEGIN/COMMIT explícitos.
-- Se qualquer etapa retornar false ou erro, pare e reporte o resultado.

-- 0) Contexto
SELECT current_user, session_user, inet_client_addr() AS client_ip, now() AS ts;

-- 1) Gerar ticket vinculado ao usuário atual (recomendado)
--    Mantenha os mesmos parâmetros em todas as chamadas
WITH t AS (
  SELECT public.fc_gen_ticket_string(current_user, 'grant-readonly') AS ticket
)
SELECT 'ticket' AS k, ticket FROM t;

-- 2) Habilitar manutenção usando o mesmo identificador e ticket
WITH t AS (
  SELECT public.fc_gen_ticket_string(current_user, 'grant-readonly') AS ticket
)
SELECT 'enable' AS k,
       public.fc_enable_maintenance(current_user, (SELECT ticket FROM t)) AS enabled;

-- 3) Validar manutenção
SELECT 'valid0' AS k, public.fc_validate_ticket();
WITH t AS (
  SELECT public.fc_gen_ticket_string(current_user, 'grant-readonly') AS ticket
)
SELECT 'valid1' AS k,
       public.fc_validate_ticket(current_user, (SELECT ticket FROM t)) AS valid;
SELECT 'valid2' AS k, public.fc_strict_validate_ticket();

-- 4) Se a validação acima não for positiva, pare aqui e reporte o resultado.

-- 5) Aplicar GRANTs (ajustados para o seu usuário de leitura)
GRANT USAGE ON SCHEMA public TO pharmacy_ro;
GRANT SELECT ON TABLE public.cadprodu TO pharmacy_ro;
GRANT SELECT ON TABLE public.cadestoq TO pharmacy_ro;
GRANT SELECT ON TABLE public.cadcddcb TO pharmacy_ro;
GRANT SELECT ON TABLE public.cadlabor TO pharmacy_ro;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO pharmacy_ro;
-- Opcional: liberar leitura em todas as tabelas
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO pharmacy_ro;

-- 6) Testar acesso (como pharmacy_ro) – faça em outra conexão/sessão
-- SELECT count(*) FROM public.cadprodu;
-- SELECT count(*) FROM public.cadestoq;
-- SELECT count(*) FROM public.cadcddcb;
-- SELECT count(*) FROM public.cadlabor;

-- 7) Encerrar manutenção: se não houver função específica, basta ENCERRAR a sessão/conexão.
