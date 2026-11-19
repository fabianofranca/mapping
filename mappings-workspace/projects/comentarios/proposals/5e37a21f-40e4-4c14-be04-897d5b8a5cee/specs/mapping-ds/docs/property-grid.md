# PropertyGrid

A grade de propriedades (`src/ui/PropertyGrid.tsx`, `.props`): duas colunas, o rótulo com 92 px e o valor no resto, 8 px entre as colunas e entre as linhas. Usada na seção Marcação, na seção Seta e no corpo de uma anotação tipada. Não tem fundo nem borda: a marcação agrupa.

Cada linha (`Property`) é feita de filhos:

- o rótulo: Texto `t-small` `muted` (4 px abaixo do topo da linha) e, quando o campo tem descrição, o HelpTip (IconButton `sm` `info`) e o menu ⋯ do campo (IconButton);
- o controle: TextField `sm`, Select `sm`, Segmented, Choice, Texto `t-body` (o valor só de leitura, `.props-text`), **ReferenceField**, **DataGrid** (o campo `table` ocupa as duas colunas, com o cabeçalho "Linhas · 5 linhas · + Linha" em cima) ou **CodeDefinitions**.

Os estados (desabilitado, inválido, alterado na revisão) vêm dos controles.
