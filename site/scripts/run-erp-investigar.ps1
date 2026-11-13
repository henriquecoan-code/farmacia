# Passo 0: investiga colunas do ERP (somente leitura). Precisa da VPN.
# Uso (na raiz do projeto):
#   powershell -ExecutionPolicy Bypass -File .\site\scripts\run-erp-investigar.ps1

$env:PGHOST = "192.168.1.220"
$env:PGPORT = "5432"
$env:PGDATABASE = "sgfpod1"
$env:PGUSER = "consulta"
if (-not $env:PGPASSWORD) {
  $sec = Read-Host "Senha do Postgres ($env:PGUSER)" -AsSecureString
  $env:PGPASSWORD = [System.Net.NetworkCredential]::new("", $sec).Password
}
# $env:PGSCHEMA = "public"

node .\site\scripts\erp-investigar.mjs
