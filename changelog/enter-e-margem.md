# Enter grava o campo longo e Envolver com margem exata — [Não lançado] (épico `epic/enter-e-margem`, PR #523, MCP 0.16.0, schema v13)

## Corrigido

- Um campo de texto longo sem quebra de linha (como a URL de uma imagem, com mais de 60 caracteres) grava com Enter, como o campo curto; o Shift+Enter quebra a linha, e com uma quebra no texto o Enter volta a quebrar. A faixa de consentimento das imagens remotas acompanha a URL na hora, sem sair do campo, e o foco fica no campo.
- O Envolver (na app e no `wrap_items` do MCP) dá 8 px de margem em volta de containers com posição inteira, também quando o arrasto deixou ruído de ponto flutuante no `placement` (antes dava 9 px). Com fração de verdade, o retângulo inteiro continua cobrindo o conjunto.
- Ir e voltar com um container pelo arrasto não deixa mais ruído (como `-2,27e-13`) no `placement` do `mapping.json`; a fração de verdade do arrasto suave com zoom continua.
