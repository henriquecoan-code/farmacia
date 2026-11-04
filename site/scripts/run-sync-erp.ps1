# Sincroniza produtos ERP -> Supabase (site novo). Precisa da VPN.
# Uso (na raiz do projeto):
#   powershell -ExecutionPolicy Bypass -File .\site\scripts\run-sync-erp.ps1              # completo
#   powershell -ExecutionPolicy Bypass -File .\site\scripts\run-sync-erp.ps1 -Modo estoque
#   powershell -ExecutionPolicy Bypass -File .\site\scripts\run-sync-erp.ps1 -DryRun       # simula
param(
  [ValidateSet("completo", "estoque")] [string]$Modo = "completo",
  [switch]$DryRun
)

# --- ERP (somente leitura) ---
$env:PGHOST = "192.168.1.220"
$env:PGPORT = "5432"
$env:PGDATABASE = "sgfpod1"
$env:PGUSER = "consulta"
if (-not $env:PGPASSWORD) {
  $sec = Read-Host "Senha do Postgres do ERP ($env:PGUSER)" -AsSecureString
  $env:PGPASSWORD = [System.Net.NetworkCredential]::new("", $sec).Password
}
$env:ESTOQUE_COD_FILIAL = "3"
$env:PG_CONNECT_TIMEOUT = "10000"
$env:PG_STATEMENT_TIMEOUT = "60000"

# Preencher depois do passo 0 (run-erp-investigar.ps1). Ex.: "p.flg_receita = 'S'"
# $env:ERP_EXPR_PRESCRICAO = ""
# $env:ERP_EXPR_EAN = ""

# --- Supabase (banco do site) ---
# Arquivo com UMA linha: a connection string do Session pooler (Supabase > Project Settings > Database).
$sbFile = "C:\Keys\supabase-db-url.txt"
if (-not (Test-Path $sbFile)) { Write-Error "Crie $sbFile com a connection string do Supabase."; exit 1 }
$env:SUPABASE_DB_URL = (Get-Content $sbFile -Raw).Trim()
# Certificado CA do Supabase (Project Settings > Database > SSL Configuration > Download certificate)
if (Test-Path "C:\Keys\supabase-ca.crt") { $env:SUPABASE_DB_CA = "C:\Keys\supabase-ca.crt" }

# --- Build automático do site (opcional) ---
if (Test-Path "C:\Keys\github-dispatch-token.txt") {
  $env:GITHUB_TOKEN = (Get-Content "C:\Keys\github-dispatch-token.txt" -Raw).Trim()
  $env:GITHUB_REPO = "henriquecoan-code/farmacia"
}

$env:SYNC_MODO = $Modo
$env:DRY_RUN = $(if ($DryRun) { "1" } else { "0" })

node .\site\scripts\sync-erp.mjs
