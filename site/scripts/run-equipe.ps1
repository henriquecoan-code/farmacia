# Acesso ao painel da equipe (/admin/). Ver site/scripts/equipe.mjs.
# Uso (na raiz do projeto):
#   powershell -ExecutionPolicy Bypass -File .\site\scripts\run-equipe.ps1 -Email pessoa@exemplo.com [-Papel atendente] [-Remover]
#   powershell -ExecutionPolicy Bypass -File .\site\scripts\run-equipe.ps1 -Listar
param(
  [string]$Email = "",
  [ValidateSet("admin", "atendente")] [string]$Papel = "admin",
  [switch]$Remover,
  [switch]$Listar
)
$sbFile = "C:\Keys\supabase-db-url.txt"
if (-not (Test-Path $sbFile)) { Write-Error "Crie $sbFile com a connection string do Supabase."; exit 1 }
$env:SUPABASE_DB_URL = (Get-Content $sbFile -Raw).Trim()
foreach ($ca in "C:\Keys\supabase-ca.crt", "C:\Keys\prod-ca-2021.crt") { if (Test-Path $ca) { $env:SUPABASE_DB_CA = $ca; break } }
$env:EQUIPE_EMAIL = $Email
$env:EQUIPE_PAPEL = $Papel
$env:EQUIPE_ACAO = $(if ($Listar) { "listar" } elseif ($Remover) { "remover" } else { "dar" })
node .\site\scripts\equipe.mjs
