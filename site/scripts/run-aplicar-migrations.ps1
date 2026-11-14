# Aplica as migrations do banco do site no Supabase.
# Uso (na raiz do projeto):
#   powershell -ExecutionPolicy Bypass -File .\site\scripts\run-aplicar-migrations.ps1
$sbFile = "C:\Keys\supabase-db-url.txt"
if (-not (Test-Path $sbFile)) { Write-Error "Crie $sbFile com a connection string do Supabase."; exit 1 }
$env:SUPABASE_DB_URL = (Get-Content $sbFile -Raw).Trim()
foreach ($ca in "C:\Keys\supabase-ca.crt", "C:\Keys\prod-ca-2021.crt") { if (Test-Path $ca) { $env:SUPABASE_DB_CA = $ca; break } }
node .\site\scripts\aplicar-migrations.mjs
