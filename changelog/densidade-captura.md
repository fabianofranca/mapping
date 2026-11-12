# Densidade da captura — [Não lançado] (épico `epic/densidade-captura`, PR #1693, MCP 0.37.0, schema v19)

## Adicionado

- Densidade do container (#1085, D1): `containers[].density` (de 0,5 a 8; padrão 1) diz quantos pixels da imagem vale uma unidade do componente (dp, pt, px a 1x). Numa captura 3x, um `button` de 174 × 120 desenha o rótulo de 14 unidades com 42 px, igual ao mesmo botão em 58 × 40 num container 1x a `zoom` 3.
- `minSize` do componente, tamanho inicial da instância, Arrumar e ajuste ao conteúdo valem em unidades e se gravam em pixels da imagem (× densidade).
- MCP: `add_container` e `update_container` aceitam `density` (`null` volta a 1; fora de 0,5 a 8 é `container-density`); `get_container`, `get_project` e `get_marking` devolvem `density`; `component-overflow.missing` continua em pixels da imagem.
- Schema v19 (a migração só sobe o número) e proposta `formatVersion` 7 (campo `density` do container).
- Densidade na app (#1085, D2): o campo **Densidade** nos Detalhes do container (1x, 1,5x, 2x, 3x, 4x ou **Personalizada** de 0,5 a 8, que aceita 2,625) e no diálogo **Novo container** (padrão 1x). Com um tamanho pronto da especialização que explique a largura (1080 = 3 × 360), os Detalhes mostram "Sugestão: 3x (Celular 360 × 800)" e o botão **Aplicar**; a app nunca aplica sozinha, e o Aplicar é uma entrada só de desfazer.
- A revisão de proposta mostra a mudança de densidade de um container como "Densidade: 1 → 3".

## Alterado

- Teto do `dist/index.html` subiu 16 KiB, de 2.097.152 para 2.113.536, pela regra do orçamento.
