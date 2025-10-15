# Template PowerShell para rodar o sync PG → Firestore
# Preencha os valores abaixo e rode: .\scripts\run-sync-template.ps1

$env:PGHOST = "SEU_HOST"
$env:PGPORT = "5432"
$env:PGDATABASE = "SEU_DB"
$env:PGUSER = "SEU_USER"
$env:PGPASSWORD = "SUA_SENHA"
# Sete para "1" se precisar SSL (ex.: Cloud PG):
# $env:PGSSL = "1"

# Caminho do service account (JSON) do Firebase Admin
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\\caminho\\serviceAccount.json"

node .\scripts\sync-pg-to-firestore.mjs
