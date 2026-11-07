# Comentários — [Não lançado] (épico `epic/comentarios`)

## Pendências

- **CM2 — seção Identidade do diálogo Configurações** (`src/ui/IdentitySettings.tsx`, em `SettingsDialog.tsx`). Componentes: o diálogo **Configurações** ganha a seção `Identidade` entre os repositórios e a `Privacidade`, no mesmo molde delas (título `repos-title`, texto `muted`, dois `TextField` — Nome e E-mail, com o estado inválido do e-mail e o aviso `role="alert"` —, um `Button` primário `sm` **Salvar** (desabilitado sem mudança válida), um `Button` `sm` **Esquecer** (só com identidade) e o `role="status"` "Identidade salva neste dispositivo."). Sem identidade, mostra o aviso "Sem identidade você só lê as conversas…". Classe nova de layout: `identity-actions` (linha com `gap: var(--space-2)`). Tokens e ícones: nenhum novo.
