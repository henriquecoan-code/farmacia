# Lista de Tarefas - Farmácia

## Fase 1: Backend
- [x] 001: Perguntar requisitos iniciais ao usuário e obter confirmações.
- [x] 002: Definir Node.js com Express.js como tecnologia para o backend.
- [x] 003: Planejar e documentar o modelo de dados do produto.
- [x] 004: Implementar backend inicial para cadastro de produtos (Node.js, Express, Multer para upload local de fotos, armazenamento em memória).
- [x] 005: Integrar o backend com o Firebase (Firestore) para persistência de dados.
- [x] 006: Solicitar ao usuário o arquivo JSON da chave de serviço do Firebase Admin (Service Account Key) e receber o arquivo.
- [x] 007: Diagnosticar e solicitar ao usuário a ativação/configuração do Firestore no projeto Firebase.
- [x] 008: Validar o funcionamento completo do backend com integração ao Firebase.
- [x] 009: Reportar e enviar código do backend para o usuário.

## Fase 2: Frontend e Implantação
- [x] 010: Perguntar requisitos do frontend ao usuário (para interface administrativa e site).
- [x] 011: Diagnosticar e garantir descompactação do arquivo frontend fornecido (Site7.zip).
- [x] 012: Analisar arquivos frontend extraídos (HTML, CSS, JS com Firebase).
- [x] 013: Definir tecnologia (manter HTML/CSS/JS) e estrutura do frontend para integração com API backend.
- [x] 014: Implementar interface de administração de produtos no frontend (`admin_produtos.html`, `js/admin_produtos.js`).
- [x] 015: Integrar interface frontend com API backend para cadastro de produtos.
- [x] 016: Validar funcionamento do frontend (servido localmente com http-server e backend rodando).
- [ ] 017: Implantar site permanentemente (Frontend exposto temporariamente. Backend não exposto publicamente. Necessita discussão para solução permanente).
- [ ] 018: Reportar e enviar acesso ao usuário (fornecer URL temporária do frontend e explicar próximos passos para backend).

## Limpeza de segurança e otimização

- [x] Excluir a pasta `backend/` e todo seu conteúdo, pois não é mais necessário para o funcionamento do site.
- [x] Remover eventuais referências ao backend em `README.md` ou outros arquivos de documentação.
- [x] Garantir que o fluxo de produtos está 100% via frontend + Firebase.
- [x] Testar o site após a exclusão para garantir que tudo funciona normalmente.

## Notas técnicas (Pedidos)

- [x] Incremento sequencial de número do pedido: implementado no cliente usando transação do Firestore em `modern/js/services/firebase-service.js#createOrder`.
	- Documento do contador: `meta/counters` com campo `orderSeq`.
	- O pedido recebe `orderNumber` e `id` com o valor sequencial.
	- Caso as regras do Firestore não permitam escrever em `meta/counters`, há fallback: o pedido é criado sem `orderNumber` e o front usa sequência local como backup.
	- Recomendado: garantir permissão de escrita ao documento `meta/counters` para usuários autenticados que possam finalizar pedidos OU mover o incremento para uma Cloud Function/Admin (mais seguro).
