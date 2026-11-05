/**
 * Menus e popovers fixos fecham ao rolar, mas o clique que os abre pode rolar a lista (ou a
 * página) até a linha, e esse evento de rolagem chega junto da abertura, ou ao longo de
 * vários quadros se a rolagem for suave (etapa #515, FN2). A guarda ignora a rolagem durante
 * uma janela curta de tempo depois da abertura (independe da ordem dos quadros) e a de
 * contêineres que não contêm o âncora; rolar depois, a pessoa, ainda fecha.
 */
export const OPEN_SCROLL_GRACE_MS = 300;

export function createOpenScrollGuard(
  anchor: () => Element | null | undefined,
): (e: Event) => boolean {
  const openedAt = performance.now();
  return (e) => {
    if (performance.now() - openedAt < OPEN_SCROLL_GRACE_MS) return false;
    const target = e.target;
    const el = anchor();
    return !(target instanceof Node && el && !target.contains(el));
  };
}
