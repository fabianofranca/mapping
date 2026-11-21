import { useId } from 'preact/hooks';
import { t } from '../i18n';
import {
  containerClassIn,
  containerClassSets,
  effectiveDensity,
  isComputedSet,
  unitsOf,
  type ProjectContainer,
  type SpecContainerClassSet,
} from '../model';
import { Select } from './controls';
import { useEditor } from './EditorContext';
import { Property } from './PropertyGrid';

interface ContainerClassFieldProps {
  readonly image: ProjectContainer;
  readonly disabled: boolean;
}

/** One `Select` of a chosen set: "None" (no class, the type is not checked there) and the classes. */
function ChosenSetField({
  image,
  set,
  disabled,
}: {
  readonly image: ProjectContainer;
  readonly set: SpecContainerClassSet;
  readonly disabled: boolean;
}) {
  const { actions } = useEditor();
  const id = useId();
  const stored = image.classes?.[set.id];
  const known = set.classes.some((c) => c.id === stored);
  return (
    <Property label={set.name} for={id} hint={t('containerClass.chosenHint')}>
      <Select
        id={id}
        size="sm"
        value={known ? (stored ?? '') : ''}
        disabled={disabled}
        onChange={(e) =>
          actions.setContainerClass(image.id, set.id, e.currentTarget.value || null)
        }
      >
        <option value="">{t('containerClass.none')}</option>
        {set.classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </Property>
  );
}

/** The read-only line of a computed set: its class and the size in units it was computed from. */
function ComputedSetLine({
  image,
  set,
}: {
  readonly image: ProjectContainer;
  readonly set: SpecContainerClassSet;
}) {
  const { store } = useEditor();
  const project = store.project.value;
  const found = project ? containerClassIn(project, image, set) : undefined;
  if (!project || !found) return null;
  const side = set.by === 'height' ? image.height : image.width;
  const units = unitsOf(side, effectiveDensity(project, image.id));
  return (
    <Property label={set.name}>
      <span class="props-text">
        {t(set.by === 'height' ? 'containerClass.byHeight' : 'containerClass.byWidth', {
          class: found.name,
          units: Number(units.toFixed(2)),
        })}
      </span>
    </Property>
  );
}

/**
 * Container classes in the container Details (stage #1901, decision 15): one `Select` per chosen set
 * and a read-only line per computed set. Hidden when no applied specialization declares a set.
 */
export function ContainerClassField({ image, disabled }: ContainerClassFieldProps) {
  const { store } = useEditor();
  const project = store.project.value;
  const sets = project ? containerClassSets(project) : [];
  return (
    <>
      {sets.map((set) =>
        isComputedSet(set) ? (
          <ComputedSetLine key={set.id} image={image} set={set} />
        ) : (
          <ChosenSetField key={set.id} image={image} set={set} disabled={disabled} />
        ),
      )}
    </>
  );
}
