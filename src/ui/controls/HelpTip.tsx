import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';
import { Icon } from '../icons';
import { Tooltip } from './Tooltip';

interface HelpTipProps {
  /** O assunto (rótulo do campo, nome do tipo): o nome acessível é "Sobre {name}". */
  readonly name: string;
  /** A explicação: vai na dica e é a descrição acessível do ícone. */
  readonly text: string;
  /**
   * `id` do elemento (fora da tela) que guarda o texto, para quem quiser apontar um
   * `aria-describedby` para a mesma explicação (o `Property` faz isso no controle do campo).
   */
  readonly descriptionId?: string;
}

/**
 * Explicação em ícone com dica ("explicação = ícone com dica"): um botão `info` focável
 * pelo teclado, com a dica no hover e no foco (`Tooltip`). Enter ou clique fixa a dica
 * aberta (`aria-expanded`), para quem usa toque; Esc (que fecha só a dica, sem chegar aos atalhos do editor), outro clique
 * ou a perda de foco a fecham. O texto também fica no DOM, fora da tela, como descrição acessível do ícone.
 * Não muda a seleção nem o projeto.
 */
export function HelpTip({ name, text, descriptionId }: HelpTipProps) {
  const generated = useId();
  const id = descriptionId ?? generated;
  const [pinned, setPinned] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!pinned) return undefined;
    const close = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || !root.current?.contains(e.target)) {
        setPinned(false);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [pinned]);
  return (
    <span ref={root} class="help-tip" onFocusOut={() => setPinned(false)}>
      <Tooltip label={text} open={pinned} onDismiss={() => setPinned(false)}>
        <button
          type="button"
          class="icon-button icon-button-sm help-tip-button"
          aria-label={t('help.about', { name })}
          aria-describedby={id}
          aria-expanded={pinned}
          onClick={() => setPinned((open) => !open)}
        >
          <Icon name="info" />
        </button>
      </Tooltip>
      <span id={id} class="visually-hidden">
        {text}
      </span>
    </span>
  );
}
