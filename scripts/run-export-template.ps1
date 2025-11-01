# Template PowerShell para exportar PG → data/products.json
# Preencha os valores e rode: .\scripts\run-export-template.ps1

$env:PGHOST = "192.168.1.220"
$env:PGPORT = "5432"
$env:PGDATABASE = "sgfpod1"
$env:PGUSER = "consulta"
$env:PGPASSWORD = "farmacia"
# $env:PGSSL = "1"  # opcional

## Timeouts (ativado)
$env:PG_CONNECT_TIMEOUT = "10000"
$env:PG_STATEMENT_TIMEOUT = "15000"

## Schema opcional (se não for 'public')
# $env:PGSCHEMA = "public"

## Amostragem (ativada)
$env:SYNC_LIMIT = "0"
# $env:SYNC_SAMPLE_IDS = "41609,41597,41591"

# Filial/rede do estoque (cadestoq.cod_filial). Default será 3 se não definido.
# Exemplo para outra rede: $env:ESTOQUE_COD_FILIAL = "5"
# $env:ESTOQUE_COD_FILIAL = "3"

node .\scripts\export-pg-to-json.mjs
$code = $LASTEXITCODE
Write-Host "[export] node exit code = $code"
exit $code
