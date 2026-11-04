# Avisos que faltam — 2026-11-02 (épico `epic/avisos-faltantes`, PR #333, MCP 0.13.0, schema v13)

## Adicionado

- Soltar um arrasto de retângulo menor que o mínimo de 8 px, com a ferramenta de marcação, agora mostra o aviso "Cada lado precisa ter pelo menos 8 px." em vez de não fazer nada. Clique simples, Esc e arrasto válido seguem sem aviso.

## Alterado

- MCP 0.13.0: `rect-too-small` no `plan_changes` e no `propose_changes` agora diz o tamanho recebido e o mínimo que valeu (8 px ou o `minSize` do componente, o maior) no `detail`, com uma `hint` para aumentar `width` e `height`; `image-overlap` diz a referência do outro container com que há sobreposição, com uma `hint` para mudar `x`/`y`/`scale` ou o tamanho, ou mover o outro container antes.
- MCP: o `detail` dos erros do modelo não é mais cortado quando tem `: ` dentro. Ao mover vários containers juntos, o `image-overlap` cita o container que não se move (antes citava o movido).
