# Sincroniza produtos ERP -> Supabase (banco do site). Precisa da rede da farmacia (ou VPN).
# Uso (na raiz do projeto):
#   powershell -ExecutionPolicy Bypass -File .\site\scripts\run-sync-erp.ps1              # completo
#   powershell -ExecutionPolicy Bypass -File .\site\scripts\run-sync-erp.ps1 -Modo estoque
#   powershell -ExecutionPolicy Bypass -File .\site\scripts\run-sync-erp.ps1 -DryRun       # simula
#   powershell -ExecutionPolicy Bypass -File .\site\scripts\run-sync-erp.ps1 -GuardarSenha # guarda a senha do ERP (uma vez)
# -Agendado e usado pelas tarefas do Windows (ver agendar-sync.ps1): nao pergunta nada, grava log
# e avisa o healthchecks.io (se houver C:\Keys\healthchecks.json).
param(
  [ValidateSet("completo", "estoque")] [string]$Modo = "completo",
  [switch]$DryRun,
  [switch]$GuardarSenha,
  [switch]$Agendado
)

# A senha do ERP fica cifrada pelo Windows (DPAPI): so este usuario, neste computador, consegue ler.
$senhaFile = "C:\Keys\erp-senha.dpapi"
$pastaLogs = Join-Path $env:LOCALAPPDATA "FarmaciaSync\logs"

if ($GuardarSenha) {
  if (-not (Test-Path "C:\Keys")) { New-Item -ItemType Directory -Path "C:\Keys" | Out-Null }
  $sec = Read-Host "Senha do Postgres do ERP (usuario consulta)" -AsSecureString
  if ($sec.Length -eq 0) { Write-Error "Senha vazia: nada foi gravado."; exit 1 }
  $sec | ConvertFrom-SecureString | Set-Content -Path $senhaFile -Encoding ASCII
  # Confere na hora que da para ler de volta
  try { Get-Content $senhaFile -Raw | ForEach-Object { $_.Trim() } | ConvertTo-SecureString -ErrorAction Stop | Out-Null }
  catch { Write-Error "A senha foi gravada, mas nao consegui ler de volta: $($_.Exception.Message)"; exit 1 }
  Write-Host "Senha guardada em $senhaFile (cifrada para o usuario $env:USERNAME neste computador)."
  exit 0
}

# ------------------------------------------------------------------ log e aviso (so no modo agendado)
$logFile = $null
$hcUrl = $null
if ($Agendado) {
  # Roda da raiz do projeto, seja qual for a pasta de onde a tarefa foi chamada
  Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\.."))
  if (-not (Test-Path $pastaLogs)) { New-Item -ItemType Directory -Path $pastaLogs -Force | Out-Null }
  $logFile = Join-Path $pastaLogs ("sync-{0}-{1}.log" -f $Modo, (Get-Date -Format "yyyy-MM"))
  # C:\Keys\healthchecks.json = { "sync-estoque": "https://hc-ping.com/...", "sync-completo": "..." }
  # Sem o arquivo (ou sem a chave), nao avisa.
  $hcFile = "C:\Keys\healthchecks.json"
  if (Test-Path $hcFile) {
    try { $hcUrl = (Get-Content $hcFile -Raw | ConvertFrom-Json)."sync-$Modo" } catch { $hcUrl = $null }
  }
}
# Uma falha no aviso nunca derruba o sync
function Avisar([string]$sufixo, [string]$corpo) {
  if (-not $hcUrl) { return }
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $bytes = [Text.Encoding]::UTF8.GetBytes($corpo)
    Invoke-WebRequest -Uri ($hcUrl.TrimEnd('/') + $sufixo) -Method Post -Body $bytes -TimeoutSec 15 -UseBasicParsing | Out-Null
  } catch { }
}
# Erro antes de o sync comecar: no modo agendado tambem vai para o log e para o healthchecks
function Falhar([string]$msg) {
  if ($Agendado) {
    Add-Content -Path $logFile -Value @(("=== {0:yyyy-MM-dd HH:mm:ss} modo={1} codigo=1 (nao iniciou)" -f (Get-Date), $Modo), $msg) -Encoding UTF8
    Avisar "/fail" $msg
  }
  Write-Error $msg
  exit 1
}

# --- ERP (somente leitura) ---
$env:PGHOST = "192.168.1.220"
$env:PGPORT = "5432"
$env:PGDATABASE = "sgfpod1"
$env:PGUSER = "consulta"
if (-not $env:PGPASSWORD) {
  if (Test-Path $senhaFile) {
    try {
      # Trim: o arquivo termina com quebra de linha, que o ConvertTo-SecureString nao aceita
      $sec = (Get-Content $senhaFile -Raw).Trim() | ConvertTo-SecureString -ErrorAction Stop
      $env:PGPASSWORD = [System.Net.NetworkCredential]::new("", $sec).Password
    } catch {
      Falhar "Nao consegui ler $senhaFile (foi gravado por outro usuario ou em outro computador). Rode de novo com -GuardarSenha."
    }
  } elseif ($Agendado) {
    Falhar "Senha do ERP nao guardada. Rode uma vez: run-sync-erp.ps1 -GuardarSenha"
  } else {
    $sec = Read-Host "Senha do Postgres do ERP ($env:PGUSER)" -AsSecureString
    $env:PGPASSWORD = [System.Net.NetworkCredential]::new("", $sec).Password
  }
}
$env:ESTOQUE_COD_FILIAL = "3"
$env:PG_CONNECT_TIMEOUT = "10000"
$env:PG_STATEMENT_TIMEOUT = "60000"

# Preencher depois do passo 0 (run-erp-investigar.ps1). Ex.: "p.flg_receita = 'S'"
# $env:ERP_EXPR_PRESCRICAO = ""
# EAN: o padrao ja le todos os codigos da tabela cadcdbar. So defina para trocar a regra.
# $env:ERP_EXPR_EAN = ""

# --- Supabase (banco do site) ---
# Arquivo com UMA linha: a connection string do Session pooler (Supabase > Project Settings > Database).
$sbFile = "C:\Keys\supabase-db-url.txt"
if (-not (Test-Path $sbFile)) { Falhar "Crie $sbFile com a connection string do Supabase." }
$env:SUPABASE_DB_URL = (Get-Content $sbFile -Raw).Trim()
# Certificado CA do Supabase (Project Settings > Database > SSL Configuration > Download certificate)
foreach ($ca in "C:\Keys\supabase-ca.crt", "C:\Keys\prod-ca-2021.crt") { if (Test-Path $ca) { $env:SUPABASE_DB_CA = $ca; break } }

# --- Build automatico do site (opcional) ---
if (Test-Path "C:\Keys\github-dispatch-token.txt") {
  $env:GITHUB_TOKEN = (Get-Content "C:\Keys\github-dispatch-token.txt" -Raw).Trim()
  $env:GITHUB_REPO = "henriquecoan-code/farmacia"
}

$env:SYNC_MODO = $Modo
$env:DRY_RUN = $(if ($DryRun) { "1" } else { "0" })

if (-not $Agendado) {
  node .\site\scripts\sync-erp.mjs
  exit $LASTEXITCODE
}

# ------------------------------------------------------------------ execucao agendada
Avisar "/start" ""
$inicio = Get-Date
# O Node escreve em UTF-8; sem isto os acentos saem trocados no log
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
$saida = @(& node .\site\scripts\sync-erp.mjs 2>&1 | ForEach-Object { "$_" })
$codigo = $LASTEXITCODE
$cabecalho = "=== {0:yyyy-MM-dd HH:mm:ss} modo={1} codigo={2} duracao={3:N0}s" -f $inicio, $Modo, $codigo, ((Get-Date) - $inicio).TotalSeconds
Add-Content -Path $logFile -Value (@($cabecalho) + $saida) -Encoding UTF8

# So as ultimas linhas vao no aviso (contagens e erro; nenhum dado de produto ou senha)
$resumo = ($saida | Select-Object -Last 12) -join "`n"
if ($codigo -eq 0) { Avisar "" $resumo } else { Avisar "/fail" $resumo }
exit $codigo
