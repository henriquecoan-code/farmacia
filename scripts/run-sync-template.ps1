# Template PowerShell para rodar o sync PG → Firestore
# Preencha os valores abaixo e rode: .\scripts\run-sync-template.ps1

$env:PGHOST = "192.168.1.220"
$env:PGPORT = "5432"
$env:PGDATABASE = "sgfpod1"
$env:PGUSER = "consulta"
# Habilitar SSL (recomendado em acesso externo)
$env:PGPASSWORD = "farmacia"
# Sete para "1" se precisar SSL (ex.: Cloud PG):
# $env:PGSSL = "1"

# Timeouts (opcional): conexão e statement, em ms
# $env:PG_CONNECT_TIMEOUT = "10000"
# $env:PG_STATEMENT_TIMEOUT = "15000"

# Caminho do service account (JSON) do Firebase Admin
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Keys\farmacia-service-account.json"

# Timeouts (ativado): conexão e statement, em ms
$env:PG_CONNECT_TIMEOUT = "10000"
$env:PG_STATEMENT_TIMEOUT = "60000"
# Schema opcional (se suas tabelas não estão no 'public')
# $env:PGSCHEMA = "public"

# Amostragem (ativada) — ajustar quantidade de itens
# Dica: você pode sobrescrever SYNC_LIMIT antes de chamar este script
$env:SYNC_LIMIT = "0"            # limite de itens

# Filial/rede do estoque (cadestoq.cod_filial). Default será 3 se não definido.
# Exemplo para outra rede: $env:ESTOQUE_COD_FILIAL = "5"
# $env:ESTOQUE_COD_FILIAL = "3"
# $env:SYNC_SAMPLE_IDS = "41609,41597,41591" # ids específicos (cod_reduzido)

# Flags operacionais (opcionais)
# Ativar logs detalhados e simular sem gravar
$env:VERBOSE = "1"      # 1 para logs detalhados
$env:DRY_RUN = "1"      # 1 para simular sem escrever no Firestore
# Otimizações/idempotência
$env:SKIP_UNCHANGED = "1"  # 1 para evitar gravações quando nada mudou
$env:ONLY_EXISTING = "0"   # 1 para atualizar apenas documentos existentes
$env:BATCH_SIZE = "400"    # tamanho do batch de writes (1–500, padrão 400)
$env:PROGRESS_EVERY = "50"  # imprime progresso a cada N itens (0 = desliga)
$env:BUMP_VERSION = "1"     # 1 para atualizar meta/counters.productsVersion

node .\scripts\sync-pg-to-firestore.mjs
