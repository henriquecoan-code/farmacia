# Atualiza apenas o estoque (quantidade) dos produtos já existentes no Firestore
# Uso:
#   .\scripts\run-sync-stock.ps1

$env:PGHOST = "192.168.1.220"
$env:PGPORT = "5432"
$env:PGDATABASE = "sgfpod1"
$env:PGUSER = "consulta"
$env:PGPASSWORD = "farmacia"

# Caminho do service account (JSON) do Firebase Admin
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Keys\farmacia-service-account.json"

# Timeouts
$env:PG_CONNECT_TIMEOUT = "10000"
$env:PG_STATEMENT_TIMEOUT = "60000"

# Schema (opcional)
# $env:PGSCHEMA = "public"

# Filial do estoque (cadestoq.cod_filial)
$env:ESTOQUE_COD_FILIAL = "3"

# Amostragem (produção): 0 = sem limite
$env:SYNC_LIMIT = "0"
# $env:SYNC_SAMPLE_IDS = "41609,41597,41591"

# Otimização: evitar writes quando quantidade não mudou
$env:SKIP_UNCHANGED = "1"
# Controlar bump de versão (0 para não atualizar productsVersion)
$env:BUMP_VERSION = "1"
# Atualizar somente documentos existentes (não criar novos)
$env:ONLY_EXISTING = "1"

# Verbose/Dry-run (produção: desligado)
$env:VERBOSE = "0"
$env:DRY_RUN = "0"

# Log de progresso: imprime a cada N itens processados (0 = desliga)
$env:PROGRESS_EVERY = "50"

node .\scripts\sync-stock-only.mjs
