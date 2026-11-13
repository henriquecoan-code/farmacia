# Fotos de entrada (produtos)

Coloque aqui as fotos tiradas no celular, **em pares e em sequência**:

1. foto do **produto** (de frente, com o fundo o mais claro possível);
2. logo depois, foto do **código de barras** do mesmo produto.

A automação vai:

- ordenar as fotos pelo horário em que foram tiradas e montar os pares (produto → código de barras);
- ler o código de barras na 2ª foto de cada par;
- tratar a foto do produto (fundo branco, 800×800, WebP) e salvar em `img/produtos/<código de barras>.webp`;
- vincular a foto ao produto do cadastro que tem esse código de barras (tabela `cadcdbar` do Trier);
- tirar daqui as fotos já processadas.

Se um par não puder ser lido (código de barras ilegível ou foto faltando), ele vai para `fotos-entrada/revisar/` para conferência, e os outros pares continuam normalmente.

Não apague este arquivo: ele mantém a pasta existindo no GitHub.
