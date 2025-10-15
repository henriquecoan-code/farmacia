# Template PowerShell para exportar PG → data/products.json
# Preencha os valores e rode: .\scripts\run-export-template.ps1

$env:PGHOST = "http://177.8.244.56"
$env:PGPORT = "5432"
$env:PGDATABASE = "sgfpod1"
$env:PGUSER = "consulta"
$env:PGPASSWORD = ""
# $env:PGSSL = "1"  # opcional

node .\scripts\export-pg-to-json.mjs
