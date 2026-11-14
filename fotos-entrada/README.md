# Fotos de entrada (produtos)

Coloque aqui as fotos tiradas no celular, **em pares e em sequência**:

1. foto do **produto** (de frente, apoiado em pé sobre uma folha branca, sem segurar na mão);
2. logo depois, foto do **código de barras** do mesmo produto.

A automação vai:

- ordenar as fotos pelo horário em que foram tiradas e montar os pares (produto → código de barras);
- ler o código de barras na 2ª foto de cada par;
- tratar a foto do produto (fundo branco, 800×800, WebP) e salvar em `site/public/produtos/<código de barras>.webp`;
- o site novo mostra a foto no produto que tem esse código de barras (tabela `cadcdbar` do ERP);
- tirar daqui as fotos já processadas.

Se um par não puder ser lido (código de barras ilegível ou foto faltando), ele vai para `fotos-entrada/revisar/` para conferência, e os outros pares continuam normalmente.

Não apague este arquivo: ele mantém a pasta existindo no GitHub.

Tudo roda sozinho no GitHub (aba Actions, "Fotos de produtos") alguns minutos depois do envio.
