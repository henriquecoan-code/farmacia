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

# Timeouts (opcional): conexão e statement, em ms
# $env:PG_CONNECT_TIMEOUT = "10000"
# $env:PG_STATEMENT_TIMEOUT = "15000"

# Caminho do service account (JSON) do Firebase Admin
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Users\henri\OneDrive\Documentos\GitHub\farmacia\serviceAccount.json"

# Timeouts (ativado): conexão e statement, em ms
$env:PG_CONNECT_TIMEOUT = "10000"
$env:PG_STATEMENT_TIMEOUT = "15000"
# Schema opcional (se suas tabelas não estão no 'public')
# $env:PGSCHEMA = "public"

# Amostragem (ativada) — testar com poucos itens
$env:SYNC_LIMIT = "3"            # limite de itens
# $env:SYNC_SAMPLE_IDS = "41609,41597,41591" # ids específicos (cod_reduzido)

node .\scripts\sync-pg-to-firestore.mjs
