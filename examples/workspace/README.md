# Pasta de mapeamentos (exemplo)

Esqueleto de uma pasta que centraliza projetos Mapping e já vem pronta para qualquer agente de IA que fale MCP: o servidor, as raízes, a skill `spec-author` e a explicação para o agente (`AGENTS.md`) moram dentro da pasta, por caminho relativo. Cada ferramenta só ganha um arquivinho de configuração apontando para o mesmo comando.

## Como usar

1. Copie esta pasta para onde quiser (ex: `~/mapeamentos`) e inicie um repositório Git nela.
2. Rode `./setup.sh` (precisa de Node ≥ 20 e `curl`). Ele baixa da última release `mcp-v*` do Mapping o servidor (`tools/mapping-mcp.js`), a skill `spec-author`, as regras do `AGENTS.md` e o `watch-comments.mjs` (o watcher de conversas, na raiz), confere o `sha256` de todos e só então atualiza a pasta. Para uma versão específica: `./setup.sh mcp-v0.5.0`; para testar uma release candidate ou o build de um PR: `./setup.sh mcp-v0.5.0-rc.1` ou `./setup.sh mcp-snapshot-pr172`.
3. Preencha a seção "Para que servem estes mapeamentos" do `AGENTS.md`: é o que o agente não descobre sozinho.
4. Abra a pasta no agente e aprove o servidor `mapping`. Abra os projetos na app do Mapping como **pasta**, dentro de `projetos/`.
5. Versione `tools/mapping-mcp.js` e `.sha256` junto: quem clonar tem o servidor funcionando sem instalar nada.

## Atualizar

Rode `./setup.sh` de novo (ou `./setup.sh <tag>`). Cada execução, nesta ordem:

1. Baixa tudo da release (`mapping-mcp.js`, `setup.sh`, `SKILL.md`, `AGENTS.mapping.md` e `watch-comments.mjs`, cada um com o `.sha256`) para uma pasta temporária e **confere o `sha256` de todos antes de trocar qualquer arquivo**. Se um não bate, o script para com erro e nada na pasta muda.
2. **Atualiza a si mesmo.** Se o `setup.sh` da release difere do local, troca o arquivo de uma vez, avisa "setup.sh atualizado" e roda de novo, uma vez só. `./setup.sh --no-self-update` (ou `./setup.sh <tag> --no-self-update`) desliga isso e segue com o script que você tem. Release sem `setup.sh` (uma tag antiga): segue com o atual e avisa.
3. Troca o servidor em `tools/`.
4. Traz a skill `spec-author` **da mesma release do servidor** para `.agents/skills/spec-author/SKILL.md` (se a release não a tiver, usa a da `main` e avisa). Em `.claude/skills/spec-author`: se já é link, nada; se é uma pasta (cópia), copia de novo; se não existe, cria o link (e uma cópia onde link não existe).
5. Instala o `watch-comments.mjs` na raiz do workspace, por cima do que houver, sem backup (é um arquivo gerenciado, como o servidor; não o edite). Release sem ele (uma tag antiga): avisa e o arquivo local, se houver, fica.
6. Atualiza o bloco de regras do `AGENTS.md`, descrito abaixo.
7. Imprime um resumo: a versão do servidor, de onde veio a skill, o que aconteceu com o `AGENTS.md` e a linha `Watcher:` (`instalado`, `atualizado`, `sem mudança` ou `não atualizado (release sem o watcher)`). Rodar duas vezes seguidas não muda nada na segunda (nem cria backup).

### Workspace criado antes disto

Quem já tem um `setup.sh` antigo roda esta linha **uma vez**, na pasta do workspace; depois disso `./setup.sh` se atualiza sozinho:

```bash
curl -fsSL https://github.com/fabianofranca/mapping/releases/latest/download/setup.sh -o setup.sh && chmod +x setup.sh && ./setup.sh
```

Ela só funciona depois da primeira release estável que traz o `setup.sh`; antes disso, use a release candidate: troque `latest/download` por `download/<tag>` e passe a mesma tag ao `./setup.sh` (ex: `…/releases/download/mcp-v0.25.0-rc.1/setup.sh -o setup.sh && chmod +x setup.sh && ./setup.sh mcp-v0.25.0-rc.1`).

### O `AGENTS.md` e os marcadores

As regras para o agente ficam num **bloco gerenciado**, entre as linhas `<!-- mapping:begin … -->` e `<!-- mapping:end -->`. O `setup.sh` troca só o que está entre elas; **não edite o bloco**, porque a próxima atualização o sobrescreve. Tudo fora do bloco é seu, a começar pela seção "Para que servem estes mapeamentos".

- Sem `AGENTS.md`: cria um (título, a seção "Para que servem" vazia e o bloco).
- Com os marcadores: troca só o bloco.
- Sem marcadores e com o `AGENTS.md` do esqueleto antigo: guarda um backup `AGENTS.md.bak-AAAAMMDD-HHMMSS`, preserva a seção "Para que servem" como está e põe o bloco no lugar das demais seções.
- Sem marcadores e com um `AGENTS.md` que o script não reconhece: guarda o backup, acrescenta o bloco no fim e avisa "revise o AGENTS.md: as seções antigas do Mapping podem ter ficado duplicadas".
- Marcadores quebrados (um sem o outro, fora de ordem ou repetidos): não mexe no arquivo e avisa.

### O que o `setup.sh` toca e o que não toca

Toca: `tools/mapping-mcp.js` (e o `.sha256`), `.agents/skills/spec-author/`, `.claude/skills/spec-author`, o `watch-comments.mjs` (na raiz) e o bloco do `AGENTS.md` (com o backup quando muda a estrutura). **Nunca toca:** `projetos/`, `especializacoes/`, um `CLAUDE.md` que já exista, o `.mcp.json` e as configurações dos outros clientes (você pode ter outros servidores registrados neles).

### Segurança

O `sha256` vem da mesma release dos arquivos que ele confere: protege contra arquivo corrompido ou incompleto, **não contra uma release adulterada**. É a mesma confiança que o `mapping-mcp.js` já exigia: quem publica a release do Mapping pode mudar o que o seu `setup.sh` baixa e roda. O script nunca executa nada que não tenha passado na conferência. Quem prefere travar a versão do próprio `setup.sh` usa `--no-self-update`.

### Variáveis só para teste

`MAPPING_RELEASE_BASE` troca a origem da release (no lugar de `https://github.com/fabianofranca/mapping/releases/…`) e `MAPPING_RAW_BASE`, a da `main` (de onde vem a skill se a release não a tiver); ambas aceitam `file://`. Existem para os testes e para o testador do Mapping, **não as use no dia a dia**: apontadas para um lugar que você não controla, elas decidem o que o script baixa e roda. `MAPPING_SETUP_UPDATED` é interna (marca a segunda rodada da autoatualização).

### Windows sem WSL

O `setup.sh` precisa de um shell POSIX. No Windows sem WSL, faça os passos à mão, com os arquivos da mesma release:

1. Baixe `mapping-mcp.js` e `mapping-mcp.js.sha256` para `tools/`, e confira o `sha256` (`certutil -hashfile tools\mapping-mcp.js SHA256`).
2. Baixe `SKILL.md` para `.agents/skills/spec-author/` e copie essa pasta para `.claude/skills/spec-author/`.
3. Baixe `AGENTS.mapping.md` e cole o conteúdo dele (as linhas de `<!-- mapping:begin … -->` a `<!-- mapping:end -->`) no seu `AGENTS.md`, no lugar do bloco que já estiver lá (ou no fim do arquivo, se for o primeiro).
4. Baixe `watch-comments.mjs` e `watch-comments.mjs.sha256` para a raiz do workspace e confira o `sha256` (`certutil -hashfile watch-comments.mjs SHA256`).
5. O `setup.sh` da release não é preciso; baixe-o só se for rodá-lo depois no WSL.

## Conversas: acordar o agente (`watch-comments.mjs`)

As conversas ancoradas ficam em `projetos/<projeto>/comments/` (formato em `docs/COMMENT-FORMAT.md` do Mapping). O servidor MCP **nunca dispara um agente**: ele só lê e escreve conversas quando o agente já está de pé. Para o agente acordar sozinho quando alguém pergunta algo, deixe o `watch-comments.mjs` (na raiz do workspace; o `setup.sh` o instala e o atualiza) rodando num terminal (Node ≥ 20, sem dependências), passando o comando que abre o seu agente depois do `--`:

```bash
node watch-comments.mjs -- claude -p "Há conversas aguardando você em projetos/. Siga a seção Conversas do AGENTS.md."
```

- Observa `projetos/*/comments/` e espera **5 s sem nenhuma mudança** (`--quiet <segundos>` ajusta) antes de agir.
- Só roda o comando se houver conversa **aberta** cuja última mensagem é de pessoa (aguarda o agente). Conversa resolvida, ou que aguarda pessoa, não dispara nada.
- Roda **um comando de cada vez**: mudança durante a execução espera o fim dele e é reavaliada. Cada par conversa e última mensagem é tratado uma vez, então uma conversa que o agente deixou sem resposta não vira laço.
- O comando recebe `MAPPING_AWAITING`, um JSON com `[{ "project", "thread", "path" }]` das conversas que motivaram a execução. `--root <pasta>` troca a pasta observada (padrão: `projetos/` ao lado do script). Ctrl+C encerra.

## Onde cada ferramenta lê a configuração

Todas apontam para o mesmo comando: `node tools/mapping-mcp.js --root projetos --root especializacoes`. Os nomes mudam entre versões; se uma ferramenta não encontrar o servidor, confira a doc dela e ajuste só o arquivo correspondente.

| Ferramenta        | Servidor MCP            | Instruções                          | Skill                    |
| ----------------- | ----------------------- | ----------------------------------- | ------------------------ |
| Claude Code       | `.mcp.json`             | `CLAUDE.md` (importa o `AGENTS.md`) | `.claude/skills/` (link) |
| Cursor            | `.cursor/mcp.json`      | `AGENTS.md`                         | `.agents/skills/`        |
| Gemini CLI        | `.gemini/settings.json` | `AGENTS.md`                         | `.agents/skills/`        |
| Copilot (VS Code) | `.vscode/mcp.json`      | `AGENTS.md`                         | `.agents/skills/`        |
| Codex CLI         | `.codex/config.toml`    | `AGENTS.md`                         | `.agents/skills/`        |

## Duas raízes, não a pasta inteira

`projetos/` é onde o servidor procura `mapping.json` (em qualquer profundidade). `especializacoes/` guarda as fontes das especializações, que precisam estar dentro de uma raiz para `validate_specialization({ path })` e `apply_specialization` as lerem. `.git/` e `tools/` ficam de fora.

## Escrever a solução a partir das marcações

O `code` de cada tipo diz como se cria uma instância dele em cada plataforma; o arquivo que o define fica no repositório (`repo`) da especialização. A conferência de existência de arquivos de código fica confinada ao diretório onde o cliente foi aberto. Para esse trabalho (`get_code_hints`, `find_by_code`), abra o agente no repositório do código e registre lá o servidor com esta pasta como raiz por caminho absoluto:

```json
{
  "mcpServers": {
    "mapping": {
      "command": "node",
      "args": [
        "/caminho/mapeamentos/tools/mapping-mcp.js",
        "--root",
        "/caminho/mapeamentos/projetos"
      ]
    }
  }
}
```

Para mapear, revisar propostas e escrever especializações, abra o agente nesta pasta.

## Referência

Servidor e tools: `docs/MCP.md` e `docs/AGENT-GUIDE.md` do Mapping. Formato da especialização: `docs/SPEC-FORMAT.md`. Skill: `.claude/skills/spec-author/SKILL.md` no repositório do Mapping (a fonte do `SKILL.md` que cada release publica e o `setup.sh` traz).
