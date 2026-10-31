import type { JSX } from 'preact';
import { useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { place } from './Popover';
import {
  filterSuggestions,
  replaceWord,
  toItems,
  wordAtCursor,
  containsWord,
  type SuggestionInput,
  type SuggestionItem,
} from './suggestions';

type InputProps = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onInput' | 'onChange' | 'onKeyDown'
>;

interface CommitInputProps extends InputProps {
  readonly value: string;
  /**
   * Chamado ao confirmar (Enter ou sair do campo) com um texto diferente do
   * atual. Devolve `false` para descartar o texto e voltar ao valor atual. O segundo argumento
   * só vem quando a pessoa escolheu na lista um item com `id` (alvo de `linkedRef`) cujo rótulo
   * ainda é uma palavra do texto; nesse caso a confirmação acontece mesmo com o texto igual ao atual.
   */
  readonly onCommit: (text: string, chosen?: SuggestionItem) => boolean;
  /**
   * Sugestões do campo (combobox ARIA). A lista abre (digitando, ↓, Ctrl+Espaço ou clique no campo vazio) com o
   * primeiro item ativo, que volta ao primeiro a cada filtragem; Enter com ela aberta escolhe o
   * ativo e não grava (com ela fechada, grava). Escolher troca só a palavra sob o cursor e não
   * grava: a próxima confirmação grava. Não restringe o valor. Sem elas, ou com o campo
   * `readOnly`/`disabled`, o campo é o de sempre.
   */
  readonly suggestions?: readonly SuggestionInput[];
}

/**
 * Campo de texto que só grava ao confirmar: digitar não gera uma entrada de
 * desfazer por tecla. Acompanha o valor externo (ex.: após desfazer).
 *
 * Teclado (`docs/ARCHITECTURE.md`, "Foco e teclado"): Enter confirma e o foco fica no campo
 * (etapa 8, F5); Esc com o que reverter volta ao valor atual e para aí (não fecha o diálogo
 * ou o menu em volta); sem o que reverter, sobe.
 */
export function CommitInput({ suggestions, ...props }: CommitInputProps) {
  const enabled =
    suggestions !== undefined &&
    suggestions.length > 0 &&
    props.readOnly !== true &&
    props.disabled !== true;
  return enabled ? (
    <CommitInputBody {...props} suggestions={suggestions} />
  ) : (
    <CommitInputBody {...props} />
  );
}

function CommitInputBody({ value, onCommit, suggestions, ...rest }: CommitInputProps) {
  // O rascunho vale só enquanto o valor externo for o mesmo de quando foi digitado.
  const [draft, setDraft] = useState({ base: value, text: value });
  const text = draft.base === value ? draft.text : value;
  const setText = (next: string) => setDraft({ base: value, text: next });
  // A última gravação (sobre qual valor, com qual texto): o `change` que o navegador
  // dispara depois do Enter, antes da renderização, traz o mesmo texto e não grava de novo.
  const combo = suggestions !== undefined;
  const listId = useId();
  const inputEl = useRef<HTMLInputElement>(null);
  const panelEl = useRef<HTMLDivElement>(null);
  const pendingCursor = useRef<number | null>(null);
  // Lista aberta: a palavra filtrada e o item ativo (sempre o primeiro ao abrir ou filtrar; Enter com a lista aberta escolhe).
  const [list, setList] = useState<{
    readonly word: string;
    readonly active: number;
    readonly exact: boolean;
  } | null>(null);
  const allItems = suggestions === undefined ? [] : toItems(suggestions);
  const shown = list === null ? [] : filterSuggestions(allItems, list.word, list.exact);
  const visible = list !== null && shown.length > 0;
  const active = visible ? Math.min(list.active, shown.length - 1) : -1;
  const closeList = () => setList(null);
  const openList = (at: number, index: number) => {
    const word = wordAtCursor(inputEl.current?.value ?? text, at).text;
    setList(
      filterSuggestions(allItems, word, true).length > 0
        ? { word, active: index, exact: true }
        : null,
    );
  };
  // Itens com `id` escolhidos nesta edição (e sobre qual valor externo): zerados ao confirmar,
  // no Esc que reverte e quando o valor externo muda.
  const chosen = useRef<{ readonly item: SuggestionItem; readonly base: string }[]>([]);
  const choose = (item: SuggestionItem) => {
    const el = inputEl.current;
    if (!el) return;
    if (item.id !== undefined) chosen.current.push({ item, base: value });
    const next = replaceWord(el.value, el.selectionStart ?? el.value.length, item.label);
    pendingCursor.current = next.cursor;
    setText(next.text);
    closeList();
  };

  // A troca do texto pelo JS leva o cursor ao fim: põe depois da sugestão.
  useLayoutEffect(() => {
    const at = pendingCursor.current;
    if (at === null) return;
    pendingCursor.current = null;
    inputEl.current?.setSelectionRange(at, at);
  });
  useLayoutEffect(() => {
    const input = inputEl.current;
    const panel = panelEl.current;
    if (!visible || !input || !panel) return;
    panel.style.minWidth = `${input.offsetWidth}px`;
    place(input, panel, 'start');
    const follow = () => place(input, panel, 'start');
    document.addEventListener('scroll', follow, true);
    globalThis.addEventListener('resize', closeList);
    return () => {
      document.removeEventListener('scroll', follow, true);
      globalThis.removeEventListener('resize', closeList);
    };
  }, [visible, shown.length]);
  useLayoutEffect(() => {
    if (active < 0) return;
    const option = panelEl.current?.querySelector('[aria-selected="true"]');
    if (option && 'scrollIntoView' in option) option.scrollIntoView({ block: 'nearest' });
  }, [active, visible]);

  const committed = useRef<{ readonly base: string; readonly text: string } | null>(null);
  // A guarda vale só enquanto o valor externo ainda é a base daquela gravação: mudou (a
  // gravação chegou, normalizada ou não, ou um desfazer), ela é zerada, e o mesmo texto
  // volta a gravar. Depois da renderização, o campo mostra o valor externo e o `change`
  // duplicado cai em `typed === value`. Um `onCommit` que aceita sem mudar o valor deixa a
  // guarda até ele mudar: redigitar o mesmo texto é ignorado, mas não gravaria nada.
  if (committed.current && committed.current.base !== value) committed.current = null;

  // Lê o texto do próprio campo: o `change` pode chegar antes da renderização que
  // acompanha o `input`, e `text` ainda seria o valor antigo.
  const commit = (typed: string) => {
    // A última escolha cujo rótulo ainda é palavra do texto vale; a lista é zerada em todo caso.
    const picked = chosen.current
      .filter((c) => c.base === value && containsWord(typed, c.item.label))
      .pop()?.item;
    chosen.current = [];
    if (picked === undefined) {
      if (typed === value) return;
      if (committed.current?.base === value && committed.current.text === typed) return;
    }
    // Gravado: o rascunho passa a ser o texto gravado. Sem isto, voltar depois ao valor de
    // antes (desfazer, limpar por outro botão) reaproveitaria o rascunho antigo.
    if (picked === undefined ? onCommit(typed) : onCommit(typed, picked)) {
      committed.current = { base: value, text: typed };
      setDraft({ base: typed, text: typed });
    } else {
      setText(value);
    }
  };

  const input = (
    <input
      {...rest}
      ref={inputEl}
      value={text}
      {...(combo
        ? {
            role: 'combobox',
            'aria-autocomplete': 'list' as const,
            'aria-expanded': visible,
            'aria-controls': listId,
            'aria-activedescendant': active >= 0 ? `${listId}-${active}` : undefined,
            autoComplete: 'off',
          }
        : {})}
      onInput={(e) => {
        const el = e.currentTarget;
        setText(el.value);
        if (!combo) return;
        const word = wordAtCursor(el.value, el.selectionStart ?? el.value.length).text;
        const found = word !== '' && filterSuggestions(allItems, word).length > 0;
        setList(found ? { word, active: 0, exact: false } : null);
      }}
      onChange={(e) => commit(e.currentTarget.value)}
      onBlur={combo ? (e) => (closeList(), commit(e.currentTarget.value)) : undefined}
      onClick={
        combo
          ? (e) => {
              if (e.currentTarget.value === '') openList(0, 0);
            }
          : undefined
      }
      onKeyDown={(e) => {
        const el = e.currentTarget;
        if (combo) {
          const at = el.selectionStart ?? el.value.length;
          // Só as teclas sem modificador: Alt+Shift+↑/↓ move a linha da tabela e Alt+Enter
          // cria uma linha (`TableField`), como sem sugestões.
          const plain = !e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey;
          if (plain && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            if (!visible) {
              if (e.key === 'ArrowDown') openList(at, 0);
            } else {
              const n = shown.length;
              const next =
                e.key === 'ArrowDown' ? (active + 1) % n : (active - 1 + n) % n;
              setList({ ...list, active: next });
            }
            return;
          }
          if (e.key === ' ' && e.ctrlKey) {
            e.preventDefault();
            openList(at, 0);
            return;
          }
          if (visible && e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closeList();
            return;
          }
          if (visible && plain && e.key === 'Enter' && active >= 0) {
            e.preventDefault();
            const item = shown[active];
            if (item) choose(item);
            return;
          }
          if (visible && e.key === 'Tab') closeList();
          if (
            visible &&
            (e.key === 'ArrowLeft' ||
              e.key === 'ArrowRight' ||
              e.key === 'Home' ||
              e.key === 'End')
          ) {
            closeList();
          }
        }
        // Também com Alt (nova linha): grava antes de a linha nova entrar.
        if (e.key === 'Enter') commit(el.value);
        if (e.key === 'Escape' && (el.value !== value || chosen.current.length > 0)) {
          chosen.current = [];
          setText(value);
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    />
  );
  if (!combo) return input;
  return (
    <>
      {input}
      {visible && (
        <div
          class="popover suggestions"
          id={listId}
          role="listbox"
          aria-label={t('suggestions.listLabel')}
          ref={panelEl}
          // Sem tirar o foco do campo.
          onMouseDown={(e) => e.preventDefault()}
        >
          {shown.map((item, index) => (
            <div
              key={index}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              class="suggestion"
              onClick={() => choose(item)}
            >
              <span class="suggestion-label">{item.label}</span>
              {item.detail !== undefined && (
                <span class="suggestion-detail">{item.detail}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
