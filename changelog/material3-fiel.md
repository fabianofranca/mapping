# Material 3 (Compose) fiel — [Não lançado] (épico `epic/material3-fiel`, PR #860, MCP sem mudança, schema v18)

## Adicionado

- A biblioteca Material 3 (Compose) tem **tema escuro**: a especialização passa à `formatVersion` 15 (biblioteca versão 2) e declara os `tokens` nos modos `light` e `dark`, com todos os papéis de cor do baseline do Compose (`primary`, `on-primary`, `surface-container-high`…), as 15 escalas de tipografia, a forma, a elevação e o estado, tirados dos arquivos de tokens do androidx no commit fixado. Com o modo do projeto em `dark`, os componentes migrados desenham as cores do escuro.
- A biblioteca traz um **conjunto de ícones** (`icons/material-icons.json`): 164 ícones do Material Icons Filled (o `Icons.Default` do Compose), do pacote `@material-design-icons/svg` 0.14.15, com a licença Apache 2.0 e a origem ao lado. As sugestões dos campos de ícone passam a listar todo o conjunto, com o nome do Compose (`Home`, `KeyboardArrowRight`).

## Alterado

- `text`, `icon`, `divider` e `surface` passam ao formato 4 dos componentes e ficam fiéis ao Compose: o `text` lê os tokens de tipografia e herda a Roboto (sem `family` no componente) e corta em `maxLines` como o `Text`; o `icon` desenha o ícone do conjunto no lugar de um `$switch` de caminhos SVG, e um nome fora do conjunto desenha o reservado e avisa; o `divider` aceita qualquer espessura; o `surface` aplica a elevação tonal só sobre a cor `surface`, como o Compose. Nenhuma cor literal sobra nesses quatro.
- Os documentos desses quatro tipos ganham a seção **Fidelidade** (arquivos de tokens do Compose usados e o que ainda difere).
- A atualização da biblioteca da versão 1 para a 2 é aditiva: nenhum campo muda de chave, de tipo ou de opções, e os projetos aplicados se atualizam sem migração.
