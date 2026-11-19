# Identity notice when commenting — 2026-11-19 (épico `epic/aviso-identidade-comentar`)

## Pendências

- `Composer`: state D receives the focus when a thread is requested (the **Fill in Settings** button), and the button is described by the notice (`aria-describedby`).
- `IconButton`: in the "Conversations and Comment" paragraph, "or with no identity" leaves the reasons for disabled; with no identity, the click opens the draft in state D, with the focus on the notice.
- `CommentsWindow` (**New conversation**) and `Menu` (**Comment**, **Comment here**): they open the Details; with no identity, state D with the focus.
- `ThreadsSection`: the "no identity" state with the focus on the button when a thread is requested.

## Sincronização

Gravado no artefato **Mapping** on 2026-11-19: version 96. `components/Composer/README.md` (state D: focus on **Fill in Settings**, described by the notice; focus on the field with an identity), `components/IconButton/README.md` (**Comment** stays enabled with no identity and opens the Details), `components/CommentsWindow/README.md` (**New conversation** opens the Details and state D), `components/Menu/README.md` (**Comment** and **Comment here** open the Details) and `components/ThreadsSection/README.md` (no identity: focus on the button when a thread is requested). The index `lastChange` was updated.

## Ficou sem gravar

Nothing.
