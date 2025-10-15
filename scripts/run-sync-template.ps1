# Template PowerShell para rodar o sync PG → Firestore
# Preencha os valores abaixo e rode: .\scripts\run-sync-template.ps1

$env:PGHOST = "192.168.1.220"
$env:PGPORT = "5432"
$env:PGDATABASE = "sgfpod1"
$env:PGUSER = "pharmacy_ro"
# Habilitar SSL (recomendado em acesso externo)
$env:PGPASSWORD = "Guiderick35-"
# Sete para "1" se precisar SSL (ex.: Cloud PG):
# $env:PGSSL = "1"

# Caminho do service account (JSON) do Firebase Admin
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Users\henri\OneDrive\Documentos\GitHub\farmacia\serviceAccount.json"

node .\scripts\sync-pg-to-firestore.mjs
