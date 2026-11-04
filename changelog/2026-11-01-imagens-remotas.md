# Imagens remotas — 2026-11-01 (épico `epic/imagens-remotas`, MCP 0.11.0, schema v13)

## Adicionado

- Nó `image` nos componentes (componente `formatVersion` 3; as versões 1 e 2 continuam aceitas): um componente pode exibir uma imagem por URL `https://`, ligada a um campo `string`.
- Consentimento por origem: uma faixa acima do canvas lista as origens novas e só pede a imagem à rede depois de "Permitir estas"; o padrão é "Agora não".
- Configurações › Privacidade: origens permitidas com Revogar e interruptores (desligados por padrão) para qualquer origem, `http:`, rede local e servidores sem CORS.
- Visualizador embutível 0.3.0 com a opção `remoteImages` (desligada por padrão) e `allowOrigin`.
- Roteiro de teste R15 e um exemplo de biblioteca com componente de avatar.

## Alterado

- A CSP do `index.html` passa a liberar `https:` e `http:` em `img-src`, com Trusted Types e `no-referrer`; `connect-src` continua `'none'`.
- A imagem nunca é gravada (projeto, zip, IndexedDB ou cache): só a URL fica no `mapping.json`.
- O MCP nunca baixa imagens: desenha o reservado e devolve a URL como texto.
- Imagens que falham ou são bloqueadas aparecem no Diagnóstico e ficam no reservado.
