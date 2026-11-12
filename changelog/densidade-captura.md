# Densidade da captura — [Não lançado] (épico `epic/densidade-captura`, PR #1693, MCP 0.37.0, schema v19)

## Adicionado

- Densidade do container (#1085, D1): `containers[].density` (de 0,5 a 8; padrão 1) diz quantos pixels da imagem vale uma unidade do componente (dp, pt, px a 1x). Numa captura 3x, um `button` de 174 × 120 desenha o rótulo de 14 unidades com 42 px, igual ao mesmo botão em 58 × 40 num container 1x a `zoom` 3.
- `minSize` do componente, tamanho inicial da instância, Arrumar e ajuste ao conteúdo valem em unidades e se gravam em pixels da imagem (× densidade).
- MCP: `add_container` e `update_container` aceitam `density` (`null` volta a 1; fora de 0,5 a 8 é `container-density`); `get_container`, `get_project` e `get_marking` devolvem `density`; `component-overflow.missing` continua em pixels da imagem.
- Schema v19 (a migração só sobe o número) e proposta `formatVersion` 7 (campo `density` do container).
