# Verifica divergências de estoque entre PG e Firestore
# Uso:
#   .\scripts\run-verify-stock.ps1

$env:PGHOST = "192.168.1.220"
$env:PGPORT = "5432"
$env:PGDATABASE = "sgfpod1"
$env:PGUSER = "consulta"
$env:PGPASSWORD = "farmacia"

$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Keys\farmacia-service-account.json"

$env:PG_CONNECT_TIMEOUT = "10000"
$env:PG_STATEMENT_TIMEOUT = "15000"

# Filial do estoque (cadestoq.cod_filial)
$env:ESTOQUE_COD_FILIAL = "3"

# Amostra: ajuste se quiser IDs específicos
$env:SYNC_LIMIT = "10"
# $env:SYNC_SAMPLE_IDS = "41609,41597,41591"

node .\scripts\verify-stock.mjs
