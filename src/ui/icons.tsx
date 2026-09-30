// Ícones em SVG inline (sem dependências), na cor do texto (`currentColor`).
import type { JSX } from 'preact';

function Icon({ children }: { readonly children: JSX.Element | JSX.Element[] }) {
  return (
    <svg
      class="icon"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const UndoIcon = () => (
  <Icon>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </Icon>
);

export const RedoIcon = () => (
  <Icon>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H10a6 6 0 0 0 0 12h3" />
  </Icon>
);

export const FitIcon = () => (
  <Icon>
    <path d="M4 9V4h5" />
    <path d="M20 9V4h-5" />
    <path d="M4 15v5h5" />
    <path d="M20 15v5h-5" />
  </Icon>
);

export const AddImageIcon = () => (
  <Icon>
    <rect x="3" y="5" width="13" height="13" rx="2" />
    <path d="m3 15 4-4 5 5" />
    <path d="M19 3v6" />
    <path d="M16 6h6" />
  </Icon>
);

export const MenuIcon = () => (
  <Icon>
    <path d="M4 6h16" />
    <path d="M4 12h16" />
    <path d="M4 18h16" />
  </Icon>
);

export const ChevronIcon = () => (
  <Icon>
    <path d="m6 15 6-6 6 6" />
  </Icon>
);
