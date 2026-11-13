# Aplica as migrations do banco do site no Supabase.
# Uso (na raiz do projeto):
#   powershell -ExecutionPolicy Bypass -File .\site\scripts\run-aplicar-migrations.ps1
$sbFile = "C:\Keys\supabase-db-url.txt"
if (-not (Test-Path $sbFile)) { Write-Error "Crie $sbFile com a connection string do Supabase."; exit 1 }
$env:SUPABASE_DB_URL = (Get-Content $sbFile -Raw).Trim()
if (Test-Path "C:\Keys\supabase-ca.crt") { $env:SUPABASE_DB_CA = "C:\Keys\supabase-ca.crt" }
node .\site\scripts\aplicar-migrations.mjs
