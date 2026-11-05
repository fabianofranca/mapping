import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import {
  chooseTypes,
  type SpecAnnotationType,
  type SpecLayerGroup,
  type TypeChoiceSection,
} from '../model';
import { Button, TextField } from './controls';
import { Icon } from './icons';
import { TypeNoticeBadge } from './NoticeBadge';

interface TypePickerProps {
  readonly types: readonly SpecAnnotationType[];
  /** Grupos declarados da camada: viram cabeçalhos (docs/SPEC-FORMAT.md). */
  readonly groups?: readonly SpecLayerGroup[];
  readonly onChoose: (type: SpecAnnotationType) => void;
}

function TypeOption({
  type,
  onChoose,
}: {
  readonly type: SpecAnnotationType;
  readonly onChoose: (type: SpecAnnotationType) => void;
}) {
  return (
    <Button class="type-option" onClick={() => onChoose(type)}>
      <span class="type-option-head">
        <strong>{type.name}</strong>
        <TypeNoticeBadge type={type} />
      </span>
      {type.description && <small class="muted">{type.description}</small>}
    </Button>
  );
}

function sectionTitle(section: TypeChoiceSection): string {
  return section.group?.name ?? t('typed.otherTypes');
}

function TypeSection({
  section,
  headers,
  onChoose,
}: {
  readonly section: TypeChoiceSection;
  readonly headers: boolean;
  readonly onChoose: (type: SpecAnnotationType) => void;
}) {
  return (
    <section class="type-section">
      {headers && <h3 class="type-group-title">{sectionTitle(section)}</h3>}
      <div class="dialog-stack">
        {section.types.map((type) => (
          <TypeOption key={type.id} type={type} onChoose={onChoose} />
        ))}
      </div>
    </section>
  );
}

/** Tipos da camada, com busca, grupos e a descrição de cada um. */
export function TypePicker({ types, groups, onChoose }: TypePickerProps) {
  const [query, setQuery] = useState('');
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    field.current?.focus();
  }, []);
  if (types.length === 0) return <p>{t('typed.noTypes')}</p>;
  const choice = chooseTypes(types, groups, query);
  const label = t(choice.total === 1 ? 'typed.searchOneType' : 'typed.searchTypes', {
    count: choice.total,
  });
  return (
    <>
      <p class="muted">{t('typed.chooseTypeHint')}</p>
      <div class="type-search">
        <Icon name="search" />
        <TextField
          type="search"
          inputRef={field}
          value={query}
          aria-label={label}
          placeholder={label}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
      </div>
      {choice.matches === 0 ? (
        <p role="status" class="muted">
          {t('typed.noTypeMatch', { query: query.trim() })}
        </p>
      ) : (
        choice.sections.map((section) => (
          <TypeSection
            key={section.key}
            section={section}
            headers={choice.headers}
            onChoose={onChoose}
          />
        ))
      )}
    </>
  );
}
