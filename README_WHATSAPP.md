# Integração WhatsApp (Meta Cloud API)

Arquivos adicionados:
- src/whatsapp/metaSender.js
- src/whatsapp/logger.js
- src/handlers/orderStatusNotifier.js
- src/routes/adminWhatsApp.js

Variáveis de ambiente esperadas:
- META_WABA_ACCESS_TOKEN
- META_WABA_PHONE_NUMBER_ID
- COMPANY_NAME (opcional, default: "Farmácia São Benedito")
- FRONTEND_URL (para links de avaliação, opcional)
- REVIEW_LINK (opcional, default: Google Reviews link configurado)

Templates sugeridos (submeter ao Meta para aprovação):

1) order_received
"Olá {{1}}, recebemos seu pedido #{{2}}. Estamos conferindo o estoque e preparando para separação. Obrigado! — {{3}}"

2) order_out_for_delivery
"Boa notícia, {{1}}! O pedido #{{2}} já saiu para entrega. Você receberá o código de rastreio em breve. — {{3}}"

3) order_delivered
"Olá {{1}}, seu pedido #{{2}} foi entregue com sucesso. Avalie sua experiência: {{3}} — {{4}}"

Observações importantes:
- Mensagens iniciadas pela empresa precisam de templates aprovados.
- Garanta consentimento (opt-in) do cliente e registre este consentimento (whatsappOptIn flag no pedido).
- Em produção, recomendamos enfileirar envios (Bull/Redis) e gravar resultados em uma tabela `whatsapp_messages`.
- Rota de teste: POST /admin/test-whatsapp
  - body ex.: { "number": "49991579441", "type": "template", "templateName": "order_received", "params": ["Henrique","1234","Farmácia São Benedito"] }

Passos para testar localmente:
1. Preencha um arquivo .env com as variáveis acima.
2. Adicione as rotas em seu app Express (ex.: `app.use(require('./src/routes/adminWhatsApp'))`).
3. Rode a aplicação e envie POST /admin/test-whatsapp para o número de teste.
4. Verifique logs em logs/whatsapp.log.

