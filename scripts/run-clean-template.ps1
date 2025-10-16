# Template PowerShell para limpar produtos com quantidade <= 0
# DRY_RUN=1 apenas exibe; DRY_RUN=0 aplica (desativa ou deleta)

# Credencial Firebase Admin
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Keys\farmacia-service-account.json"

# Modo: 'deactivate' (padrão) ou 'delete'
$env:CLEAN_MODE = "deactivate"

# DRY RUN: "1" (padrão) não aplica; "0" aplica mudanças
$env:DRY_RUN = "1"

# Tamanho do batch (opcional)
# $env:BATCH_SIZE = "400"

node .\scripts\clean-products.mjs
