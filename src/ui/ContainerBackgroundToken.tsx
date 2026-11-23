import { containerBackgroundColor, type ProjectContainer } from '../model';
import type { ContainerBackgroundToken as BackgroundToken } from '../model';
import { t } from '../i18n';
import type { StoreErrorCode } from '../store/history';
import { Button } from './controls';
import { useEditor } from './EditorContext';

interface Props {
  readonly image: ProjectContainer;
  readonly token: BackgroundToken;
  readonly disabled: boolean;
  /** Reports the error of replacing the token (the field shows it under the value). */
  readonly onError: (code: StoreErrorCode | null) => void;
}

/**
 * Background of a container that carries a token (stage #1900, NV4, decision 27): the token name and the
 * swatch of the color it resolves to are read-only, and **Use a fixed color** replaces the token with that
 * color in one undo entry. The app never writes a token, it only shows one that an agent proposed.
 */
export function ContainerBackgroundToken({ image, token, disabled, onError }: Props) {
  const { actions, review } = useEditor();
  // The color shown is the one on screen (the Proposed view in a review); the button acts on the real project.
  const project = review.derived.shownProject.value;
  const color = project
    ? (containerBackgroundColor(project, image.id) ?? '#FFFFFF')
    : '#FFFFFF';
  return (
    <div class="props-text">
      <span class="swatch-color" style={{ background: color }} aria-hidden="true" />{' '}
      {t('container.backgroundToken', { name: token.$token })} · <code>{color}</code>{' '}
      <Button
        size="sm"
        disabled={disabled}
        onClick={() => {
          const result = actions.setBackgroundContainer(image.id, { background: color });
          onError(result.ok ? null : result.error);
        }}
      >
        {t('container.useFixedColor')}
      </Button>
    </div>
  );
}
