# Aviso "O componente não cabe" com a palavra larga — 2026-11-12 (épico `epic/aviso-nao-cabe-pai-none`, PR #1746, MCP 0.38.1 provisório, schema v19)

## Corrigido

- Uma palavra mais larga que a caixa do texto agora avisa `texto maior que a caixa: <nó>` na app (pendência "O componente não cabe", com o ⚠ na marcação) e no MCP (`component-overflow` com `kind: "text"` no `plan_changes` e no `propose_changes`), em qualquer `formatVersion`. É o caso do `button` "Salvar" em 58 × 40 e do `extended-fab` estreito ("Novo" em 50 × 56, "Confirmar compra" em 60 × 56): antes só se conferia a altura do texto e o botão não avisava. O desenho não muda; o texto continua quebrando só entre palavras, como no CSS. Texto com `maxLines` ou `ellipsis` não avisa, e no texto rico (`runs`) o aviso vale para um trecho ou chip mais largo que a caixa.
- O aviso de palavra larga também vale para o rótulo com espaço em `wrap: none` (a linha é o parágrafo todo e passava da caixa sem avisar, ao contrário do mesmo texto em `runs`), para uma palavra separada por tab (a quebra é só em espaço) e para emoji ou CJK mais largos que 1em, que o atalho de largura escondia.
- Biblioteca `material3-compose`: o `separador` (":") do `time-picker` leva `maxLines: 1` no `font`, o que tira um falso positivo da medida aproximada, sem mudar o desenho (a `version` continua 10).
- Uma grade `hug` cujas medidas com dois limites (300 e 150) dão o mesmo total com contagens de trilhas diferentes (#1692) fica provada por teste, nas duas ordens em que um pai `hug` a mede; o motor não precisou mudar.
- O aviso "Só a primeira sombra vale neste nó…" voltou ao Catálogo e ao visualizador: texto, caminho ou imagem com mais de uma sombra externa ou com `spread` mostram o aviso (o retângulo, a elipse e o quadro desenham a lista inteira, sem aviso). O PNG do MCP segue igual.
- A seta entre o parâmetro e o valor, na seção do código do Catálogo, passa a vir do `t()` (antes estava no CSS, fora da tradução).

## Alterado

- `component-overflow`: o `kind: "text"` passa a valer também para a palavra mais larga que a caixa (`docs/MCP.md`, `docs/COMPONENT-FORMAT.md`, `docs/AGENT-GUIDE.md` e a skill `spec-author`). O MCP 0.38.1 traz o guia dos agentes atualizado.
- Limpezas internas sem mudança de desenho: `strokeAlignInset` e `spreadRadius` ficam num lugar só (`strokeSides.ts`) e saem as duplicatas do Konva, do raster e do contorno com vão; saem os atributos de sombra só de teste e o `slotCache` que nunca acertava. O `customEnds` do PNG justificado fica provado por teste.
- Roteiros: o R9.11 passa a esperar o aviso nos dois botões de 58 de largura, e o R17.40 leva um `update_marking` de `d1` para 96 × 40 antes do `update_container`, para o `plan_changes` sem `density` continuar sem `component-overflow`.
