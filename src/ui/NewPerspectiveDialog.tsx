import { useId, useState } from 'preact/hooks';
import { t } from '../i18n';
import { projectPerspectiveNameIssue, type Project } from '../model';
import type { NewPerspectiveStart } from '../store/perspectiveActions';
import { Button, Choice, Segmented, Select, TextField } from './controls';
import { Dialog } from './Dialog';
import { useEditor } from './EditorContext';
import { perspectiveNameMessage } from './perspectiveNameMessage';

const MAIN = 'main';
const EMPTY = 'empty';
const PREFIX = 'p:';

type Who = 'all' | 'mine';

/** The value of the "Start from" Select as the action's argument. */
function startOf(value: string): NewPerspectiveStart {
  if (value === MAIN) return null;
  if (value === EMPTY) return 'empty';
  return value.slice(PREFIX.length);
}

/** The layers hidden when starting from `value` (Main and Empty show all of them). */
function hiddenFrom(project: Project, value: string): readonly string[] {
  if (!value.startsWith(PREFIX)) return [];
  const source = project.perspectives.find((x) => x.id === value.slice(PREFIX.length));
  return source ? source.hiddenLayers : [];
}

/**
 * New perspective: name, where it starts from, who sees it and which layers appear. Once
 * created, the new perspective is opened.
 */
export function NewPerspectiveDialog({ onClose }: { readonly onClose: () => void }) {
  const { session, store } = useEditor();
  const project = store.project.value;
  const ids = useId();
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [start, setStart] = useState(MAIN);
  const [who, setWho] = useState<Who>('all');
  const [hidden, setHidden] = useState<readonly string[]>([]);
  const [failed, setFailed] = useState(false);
  if (!project) return null;

  const issue = projectPerspectiveNameIssue(project, name);
  const canCreate = issue === null;
  const localAvailable = session.perspective.localAvailable;

  const submit = (e: Event) => {
    e.preventDefault();
    setTouched(true);
    if (!canCreate) return;
    const result = session.perspectiveActions.createPerspective({
      name: name.trim(),
      startFrom: startOf(start),
      local: who === 'mine',
      hiddenLayers: hidden,
    });
    if (!result.ok) {
      setFailed(true);
      return;
    }
    onClose();
    session.perspective.open(result.value);
  };

  const toggleLayer = (id: string, shown: boolean) =>
    setHidden(shown ? hidden.filter((x) => x !== id) : [...hidden, id]);

  return (
    <Dialog
      title={t('perspective.new.title')}
      onCancel={onClose}
      actions={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            type="submit"
            form={`${ids}-form`}
            variant="primary"
            disabled={!canCreate}
          >
            {t('perspective.new.create')}
          </Button>
        </>
      }
    >
      <form id={`${ids}-form`} class="perspective-form" noValidate onSubmit={submit}>
        <p class="muted">{t('perspective.new.intro')}</p>
        <div class="perspective-row">
          <label class="perspective-row-label" for={`${ids}-name`}>
            {t('perspective.new.name')}
          </label>
          <div class="perspective-row-field">
            <TextField
              id={`${ids}-name`}
              value={name}
              invalid={touched && issue !== null}
              onInput={(e) => {
                setName(e.currentTarget.value);
                setTouched(true);
              }}
            />
            {touched && issue !== null && (
              <p class="field-error" role="alert">
                {perspectiveNameMessage(issue, name)}
              </p>
            )}
          </div>
        </div>
        <div class="perspective-row">
          <label class="perspective-row-label" for={`${ids}-start`}>
            {t('perspective.new.startFrom')}
          </label>
          <div class="perspective-row-field">
            <Select
              id={`${ids}-start`}
              value={start}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setStart(value);
                setHidden(hiddenFrom(project, value));
              }}
            >
              <option value={MAIN}>{t('perspective.principal')}</option>
              {project.perspectives.map((x) => (
                <option key={x.id} value={`${PREFIX}${x.id}`}>
                  {x.name}
                </option>
              ))}
              <option value={EMPTY}>{t('perspective.new.startEmpty')}</option>
            </Select>
            <p class="muted perspective-hint">{t('perspective.new.startHint')}</p>
          </div>
        </div>
        <div class="perspective-row">
          <span class="perspective-row-label">{t('perspective.new.who')}</span>
          <div class="perspective-row-field">
            <Segmented<Who>
              label={t('perspective.new.who')}
              value={who}
              onSelect={setWho}
              items={[
                { id: 'all', label: t('perspective.new.whoAll') },
                {
                  id: 'mine',
                  label: t('perspective.new.whoMine'),
                  disabled: !localAvailable,
                },
              ]}
            />
            {!localAvailable && (
              <p class="muted perspective-hint">
                {t('perspective.new.localUnavailable')}
              </p>
            )}
          </div>
        </div>
        {project.layers.length > 0 && (
          <div class="perspective-row">
            <span class="perspective-row-label" id={`${ids}-layers`}>
              {t('perspective.new.layers')}
            </span>
            <div class="perspective-row-field">
              <div
                class="perspective-layers"
                role="group"
                aria-labelledby={`${ids}-layers`}
              >
                {project.layers.map((layer) => (
                  <Choice
                    key={layer.id}
                    label={layer.name}
                    checked={!hidden.includes(layer.id)}
                    onChange={(e) => toggleLayer(layer.id, e.currentTarget.checked)}
                  />
                ))}
              </div>
              <p class="muted perspective-hint">{t('perspective.new.layersHint')}</p>
            </div>
          </div>
        )}
        {failed && (
          <p class="field-error" role="alert">
            {t('perspective.error')}
          </p>
        )}
      </form>
    </Dialog>
  );
}
