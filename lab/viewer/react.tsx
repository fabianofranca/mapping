/** @jsxImportSource react */
/**
 * Invólucro React fino do visualizador embutível (fase L1): `<MappingViewer/>` é um `<div>`
 * que hospeda um `createViewer`. Importa só de `react` (o `react-dom` é do hospedeiro).
 *
 * - O viewer é criado e destruído por `useEffect([])`: em `<StrictMode>` o React monta,
 *   desmonta e monta de novo, e cada ciclo cria e descarta o seu viewer sem vazar.
 * - Os callbacks (`onHover`, `onClick`, `onWarnings`) são lidos por ref: passar uma função nova
 *   a cada render NÃO recria o viewer.
 * - `library`/`screen` → `update`, `selection` → `setSelection`, `hover` → `setHover`,
 *   `fontsVersion` → `redraw`.
 * - `fit` e `padding` valem só na criação (mudá-los depois não reenquadra). Para reenquadrar
 *   a pedido, use `createViewer` direto e chame `viewer.fit()`.
 */
import { useEffect, useRef } from 'react';
import type { CSSProperties, JSX } from 'react';
import { createViewer } from './index';
import type { Library, Screen, Viewer, ViewerOptions } from './index';

export * from './index';

export interface MappingViewerProps {
  readonly library: Library | undefined;
  readonly screen: Screen | undefined;
  readonly selection?: readonly string[];
  readonly hover?: string | undefined;
  readonly onHover?: ViewerOptions['onHover'];
  readonly onClick?: ViewerOptions['onClick'];
  readonly onWarnings?: ViewerOptions['onWarnings'];
  /** Só na criação do viewer (mudar depois não tem efeito). */
  readonly fit?: ViewerOptions['fit'];
  /** Só na criação do viewer (mudar depois não tem efeito). */
  readonly padding?: number;
  readonly className?: string;
  /** Mesclado sobre o padrão `{ width: '100%', height: '100%' }`. */
  readonly style?: CSSProperties;
  /** Versão das fontes do hospedeiro: mudar o valor chama `redraw()` (remede os textos). */
  readonly fontsVersion?: number | string;
}

const NO_SELECTION: readonly string[] = [];
const FILL: CSSProperties = { width: '100%', height: '100%' };

export function MappingViewer(props: MappingViewerProps): JSX.Element {
  const { library, screen, selection, hover, fontsVersion, className, style } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  /** Sempre a última versão das props: callbacks e valores iniciais da criação. */
  const latest = useRef(props);

  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const initial = latest.current;
    const viewer = createViewer(container, {
      library: initial.library,
      screen: initial.screen,
      fit: initial.fit,
      padding: initial.padding,
      onHover: (id) => latest.current.onHover?.(id),
      onClick: (id, point) => latest.current.onClick?.(id, point),
      onWarnings: (warnings) => latest.current.onWarnings?.(warnings),
    });
    viewerRef.current = viewer;
    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    viewerRef.current?.update({ library, screen });
  }, [library, screen]);

  useEffect(() => {
    viewerRef.current?.setSelection(selection ?? NO_SELECTION);
  }, [selection]);

  useEffect(() => {
    viewerRef.current?.setHover(hover);
  }, [hover]);

  const drawnFonts = useRef(fontsVersion);
  useEffect(() => {
    // O valor da criação não redesenha (o viewer já desenhou com ele), nem a remontagem do StrictMode.
    if (drawnFonts.current === fontsVersion) return;
    drawnFonts.current = fontsVersion;
    viewerRef.current?.redraw();
  }, [fontsVersion]);

  return <div ref={containerRef} className={className} style={{ ...FILL, ...style }} />;
}
