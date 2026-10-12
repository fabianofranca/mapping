// O jsdom não implementa `showModal`/`close` nem a inércia do resto da página com um
// diálogo modal aberto. No Chrome, enquanto o modal está aberto, `focus()` num elemento
// fora dele não faz nada; e, quando o diálogo sai do DOM com o foco dentro, o foco cai no
// `body`. Este simulador reproduz as duas coisas para os testes de foco ao fechar
// (etapa 7, achado A1): sem ele, um `focus()` feito com o modal ainda aberto passaria no
// jsdom e falharia no navegador.

interface Saved {
  readonly showModal: PropertyDescriptor | undefined;
  readonly close: PropertyDescriptor | undefined;
  readonly focus: PropertyDescriptor | undefined;
}

let saved: Saved | null = null;
const modals: HTMLDialogElement[] = [];

/** O modal de cima, se ainda estiver aberto e no DOM. */
function topModal(): HTMLDialogElement | undefined {
  for (let i = modals.length - 1; i >= 0; i--) {
    const dialog = modals[i];
    if (dialog?.isConnected && dialog.open) return dialog;
  }
  return undefined;
}

/** Liga a simulação do modal; `restoreModalFocus` desliga. */
export function simulateModalFocus(): void {
  if (saved) return;
  const dialogProto = HTMLDialogElement.prototype;
  const elementProto = HTMLElement.prototype;
  saved = {
    showModal: Object.getOwnPropertyDescriptor(dialogProto, 'showModal'),
    close: Object.getOwnPropertyDescriptor(dialogProto, 'close'),
    focus: Object.getOwnPropertyDescriptor(elementProto, 'focus'),
  };
  const nativeFocus = elementProto.focus;
  Object.defineProperty(dialogProto, 'showModal', {
    configurable: true,
    writable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute('open', '');
      modals.push(this);
    },
  });
  Object.defineProperty(dialogProto, 'close', {
    configurable: true,
    writable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute('open');
      const at = modals.indexOf(this);
      if (at >= 0) modals.splice(at, 1);
    },
  });
  Object.defineProperty(elementProto, 'focus', {
    configurable: true,
    writable: true,
    value(this: HTMLElement, options?: FocusOptions) {
      const modal = topModal();
      // Fora do modal aberto, a página está inerte: o foco não sai do diálogo.
      if (modal && !modal.contains(this)) return;
      nativeFocus.call(this, options);
    },
  });
}

export function restoreModalFocus(): void {
  if (!saved) return;
  const restore = (target: object, key: string, d: PropertyDescriptor | undefined) => {
    if (d) Object.defineProperty(target, key, d);
    else Reflect.deleteProperty(target, key);
  };
  restore(HTMLDialogElement.prototype, 'showModal', saved.showModal);
  restore(HTMLDialogElement.prototype, 'close', saved.close);
  restore(HTMLElement.prototype, 'focus', saved.focus);
  saved = null;
  modals.length = 0;
}
