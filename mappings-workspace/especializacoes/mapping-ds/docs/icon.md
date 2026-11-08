# Ícone

Ícone solto (`<Icon name="…" />` de `src/ui/icons.tsx`): 16 px, traço de 1,25 com pontas e cantos redondos, na cor do texto em volta (`currentColor`). `icone` é a chave camelCase (a lista de sugestões traz os 89). Ícone que é botão é IconButton; este é o ícone decorativo (o logo da barra principal, a seta de uma seção, o ícone de um item da barra de status).

Os ícones vêm do conjunto da biblioteca (`icons/icons.json`, gerado do `src/ui/icons.tsx`: os traços com ponta e canto redondos e os pontos cheios). No conjunto o nome é em kebab-case (`chevronDown` vira `chevron-down`); o campo continua com a chave do app, e o desenho converte. Nome fora da lista desenha o reservado.
