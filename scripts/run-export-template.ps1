# Template PowerShell para exportar PG → data/products.json
# Preencha os valores e rode: .\scripts\run-export-template.ps1

$env:PGHOST = "192.168.1.220"
$env:PGPORT = "5432"
$env:PGDATABASE = "sgfpod1"
$env:PGUSER = "pharmacy_ro"
$env:PGPASSWORD = "Guiderick35-"
# $env:PGSSL = "1"  # opcional

# Timeouts (opcional)
# $env:PG_CONNECT_TIMEOUT = "10000"
# $env:PG_STATEMENT_TIMEOUT = "15000"

# Amostragem (opcional)
# $env:SYNC_LIMIT = "3"
# $env:SYNC_SAMPLE_IDS = "123,456"

node .\scripts\export-pg-to-json.mjs
