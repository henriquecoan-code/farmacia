# Cria no Agendador de Tarefas do Windows (pasta \Farmacia\) as tarefas que mantem o site atualizado:
#   Sync estoque   a cada 30 min, das 07:30 as 22:00   (so quantidade em estoque)
#   Sync completo  todo dia as 22:30                    (precos, produtos novos; republica o site se mudou)
# Uso (na raiz do projeto, no PC da farmacia, com o usuario que vai ficar logado):
#   powershell -ExecutionPolicy Bypass -File .\site\scripts\agendar-sync.ps1            # cria ou atualiza
#   powershell -ExecutionPolicy Bypass -File .\site\scripts\agendar-sync.ps1 -Listar    # mostra a situacao
#   powershell -ExecutionPolicy Bypass -File .\site\scripts\agendar-sync.ps1 -Remover   # apaga as tarefas
# Antes, uma vez: run-sync-erp.ps1 -GuardarSenha (as tarefas nao perguntam a senha do ERP).
# As tarefas rodam com o usuario logado, sem janela. Para ver ou mudar horarios: taskschd.msc > Farmacia.
param(
  [switch]$Listar,
  [switch]$Remover,
  [int]$IntervaloEstoqueMin = 30,
  [string]$InicioEstoque = "07:30",
  [string]$FimEstoque = "22:00",
  [string]$HoraCompleto = "22:30"
)
$ErrorActionPreference = "Stop"
$pasta = "\Farmacia\"
$tarefas = @("Sync estoque", "Sync completo")
$vbs = Join-Path $PSScriptRoot "run-oculto.vbs"
$raiz = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$pastaLogs = Join-Path $env:LOCALAPPDATA "FarmaciaSync\logs"

function Mostrar {
  $achou = $false
  foreach ($nome in $tarefas) {
    $t = Get-ScheduledTask -TaskPath $pasta -TaskName $nome -ErrorAction SilentlyContinue
    if (-not $t) { Write-Host ("  {0,-14} nao existe" -f $nome); continue }
    $achou = $true
    $i = $t | Get-ScheduledTaskInfo
    $res = if ($i.LastTaskResult -eq 0) { "ok" } elseif ($i.LastTaskResult -eq 267011) { "ainda nao rodou" } else { "ERRO (codigo $($i.LastTaskResult))" }
    Write-Host ("  {0,-14} {1,-9} ultima: {2:dd/MM HH:mm} ({3})  proxima: {4:dd/MM HH:mm}" -f $nome, $t.State, $i.LastRunTime, $res, $i.NextRunTime)
  }
  if ($achou) { Write-Host "  Logs: $pastaLogs" }
}

if ($Listar) { Mostrar; exit 0 }

if ($Remover) {
  foreach ($nome in $tarefas) {
    if (Get-ScheduledTask -TaskPath $pasta -TaskName $nome -ErrorAction SilentlyContinue) {
      Unregister-ScheduledTask -TaskPath $pasta -TaskName $nome -Confirm:$false
      Write-Host "Removida: $nome"
    }
  }
  exit 0
}

# --- conferencias antes de agendar ---
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Error "Node.js nao encontrado. Instale em https://nodejs.org (versao LTS)."; exit 1 }
if (-not (Test-Path (Join-Path $raiz "site\node_modules\pg"))) { Write-Error "Dependencias nao instaladas. Rode: cd site ; npm install"; exit 1 }
if (-not (Test-Path "C:\Keys\supabase-db-url.txt")) { Write-Error "Falta C:\Keys\supabase-db-url.txt (conexao do Supabase)."; exit 1 }
if (-not (Test-Path "C:\Keys\erp-senha.dpapi")) {
  Write-Error "Senha do ERP ainda nao guardada. Rode antes: powershell -ExecutionPolicy Bypass -File .\site\scripts\run-sync-erp.ps1 -GuardarSenha"
  exit 1
}
if (-not (Test-Path "C:\Keys\github-dispatch-token.txt")) { Write-Warning "Sem C:\Keys\github-dispatch-token.txt: o sync nao vai avisar o site quando o catalogo mudar (ele ainda se atualiza todo dia as 03:30)." }
if (-not (Test-Path "C:\Keys\healthchecks.json")) { Write-Warning "Sem C:\Keys\healthchecks.json: as execucoes nao serao avisadas ao healthchecks.io." }

$usuario = "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited
# Se o PC estava desligado na hora, roda assim que ligar; nunca duas ao mesmo tempo; mata se travar
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

function Acao([string]$modo) {
  New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\wscript.exe" -Argument ('"{0}" {1}' -f $vbs, $modo) -WorkingDirectory $raiz
}

# Estoque: todo dia, repetindo a cada N minutos entre o inicio e o fim
$ini = [datetime]::ParseExact($InicioEstoque, "HH:mm", $null)
$fim = [datetime]::ParseExact($FimEstoque, "HH:mm", $null)
if ($fim -le $ini) { Write-Error "FimEstoque precisa ser depois de InicioEstoque."; exit 1 }
$gEstoque = New-ScheduledTaskTrigger -Daily -At $ini
$rep = New-ScheduledTaskTrigger -Once -At $ini -RepetitionInterval (New-TimeSpan -Minutes $IntervaloEstoqueMin) -RepetitionDuration ($fim - $ini)
$gEstoque.Repetition = $rep.Repetition
Register-ScheduledTask -TaskPath $pasta -TaskName "Sync estoque" -Action (Acao "estoque") -Trigger $gEstoque -Principal $principal -Settings $config `
  -Description "Farmacia Sao Benedito: copia o estoque do ERP para o site (Supabase). Script: site\scripts\run-sync-erp.ps1 -Modo estoque -Agendado" -Force | Out-Null

# Completo: uma vez por dia, depois que a loja fecha
$gCompleto = New-ScheduledTaskTrigger -Daily -At ([datetime]::ParseExact($HoraCompleto, "HH:mm", $null))
Register-ScheduledTask -TaskPath $pasta -TaskName "Sync completo" -Action (Acao "completo") -Trigger $gCompleto -Principal $principal -Settings $config `
  -Description "Farmacia Sao Benedito: sincroniza precos e produtos do ERP com o site e republica o site se algo mudou. Script: site\scripts\run-sync-erp.ps1 -Modo completo -Agendado" -Force | Out-Null

Write-Host "Tarefas criadas para o usuario $usuario (rodam enquanto ele estiver logado):"
Mostrar
Write-Host ""
Write-Host "Para testar agora:  Start-ScheduledTask -TaskPath '$pasta' -TaskName 'Sync estoque'"
Write-Host "Para acompanhar:    agendar-sync.ps1 -Listar   ou   taskschd.msc > Farmacia"
