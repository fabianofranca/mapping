import { computed, type ReadonlySignal } from '@preact/signals';
import { perspectiveView, type Perspective, type Project } from '../model';
import type { ProjectStore } from './history';
import { openPerspectiveIn } from './perspectives';

// O projeto à vista de uma perspectiva (etapa #659, PE2, decisão 3): quem desenha ou lista lê
// `perspectiveView`, memoizado por projeto e objeto de perspectiva, então nada aqui depende do
// viewport (pan e zoom não recalculam).

/** `p` como a perspectiva aberta (`id`) o mostra; a Principal (`null`) ou um id sem perspectiva é o próprio `p`. */
export function projectInPerspective(p: Project, id: string | null): Project;
export function projectInPerspective(
  p: Project | null,
  id: string | null,
): Project | null;
export function projectInPerspective(
  p: Project | null,
  id: string | null,
): Project | null {
  return p && id !== null ? perspectiveView(p, openPerspectiveIn(p, id)) : p;
}

/** Sem perspectiva aberta: o padrão de quem não conhece perspectivas (testes do editor). */
export const NO_PERSPECTIVE: ReadonlySignal<Perspective | null> = computed(() => null);

/**
 * A perspectiva aberta do projeto confirmado (`null` = a Principal). O mesmo objeto enquanto a
 * perspectiva não muda: quem depende dela só recalcula quando ela muda de fato.
 */
export function createOpenPerspective(
  store: ProjectStore,
  id: ReadonlySignal<string | null>,
): ReadonlySignal<Perspective | null> {
  return computed(() => {
    const project = store.committed.value;
    return project ? openPerspectiveIn(project, id.value) : null;
  });
}
