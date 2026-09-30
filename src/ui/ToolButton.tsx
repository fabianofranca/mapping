import type { JSX } from 'preact';

interface ToolButtonProps {
  readonly icon: JSX.Element;
  /** Rótulo acessível (e dica ao passar o mouse). */
  readonly label: string;
  /** Texto visível ao lado do ícone; sem ele, o botão mostra só o ícone. */
  readonly text?: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}

export function ToolButton({ icon, label, text, disabled, onClick }: ToolButtonProps) {
  return (
    <button
      type="button"
      class="button tool-button"
      aria-label={text ? undefined : label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {text && <span>{text}</span>}
    </button>
  );
}
