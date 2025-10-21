# Template PowerShell para rodar o sync PG → Firestore
# Preencha os valores abaixo e rode: .\scripts\run-sync-template.ps1

$env:PGHOST = "192.168.1.220"
$env:PGPORT = "5432"
$env:PGDATABASE = "sgfpod1"
$env:PGUSER = "consulta"
# Habilitar SSL (recomendado em acesso externo)
$env:PGPASSWORD = "farmacia"
# Sete para "1" se precisar SSL (ex.: Cloud PG):
# $env:PGSSL = "1"

# Timeouts (opcional): conexão e statement, em ms
# $env:PG_CONNECT_TIMEOUT = "10000"
# $env:PG_STATEMENT_TIMEOUT = "15000"

# Caminho do service account (JSON) do Firebase Admin
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Keys\farmacia-service-account.json"

# Timeouts (ativado): conexão e statement, em ms
$env:PG_CONNECT_TIMEOUT = "10000"
$env:PG_STATEMENT_TIMEOUT = "60000"
# Schema opcional (se suas tabelas não estão no 'public')
# $env:PGSCHEMA = "public"

# Amostragem (ativada) — ajustar quantidade de itens
# Dica: você pode sobrescrever SYNC_LIMIT antes de chamar este script
$env:SYNC_LIMIT = "0"            # limite de itens

# Filial/rede do estoque (cadestoq.cod_filial). Default será 3 se não definido.
# Exemplo para outra rede: $env:ESTOQUE_COD_FILIAL = "5"
# $env:ESTOQUE_COD_FILIAL = "3"
# $env:SYNC_SAMPLE_IDS = "41609,41597,41591" # ids específicos (cod_reduzido)

node .\scripts\sync-pg-to-firestore.mjs
