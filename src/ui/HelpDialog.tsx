import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { t, type TranslationKey } from '../i18n';
import { specHelpSections, type HelpBlock } from '../i18n/specHelp';
import { locale } from '../store/settings';
import { Dialog } from './Dialog';
import { downloadHelpAsset, HELP_ASSETS } from './helpAssets';
import { matchesSearch } from '../utils/search';
import { blockText } from './helpText';
import { Button, LinkButton, TextField } from './controls';
import { Icon } from './icons';
import { guideUrl } from '../utils/guideLink';
import { comboText, shortcutGroups, type KeyCombo } from './shortcutList';

/** Id of the Shortcuts section, to open Help straight on it (Settings → shortcuts). */
export const HELP_SHORTCUTS = 'shortcuts';
/** Id of the proposals section ("How the agent sends proposals"). */
export const HELP_PROPOSALS = 'proposals';
/** Id of the interactive guide section (`guia/` page, opened in another tab). */
export const HELP_GUIDE = 'guide';

function Block({ block }: { readonly block: HelpBlock }) {
  switch (block.kind) {
    case 'p':
      return <p>{block.text}</p>;
    case 'list':
      return (
        <ul>
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case 'terms':
      return (
        <dl class="help-terms">
          {block.items.map((item) => (
            <div key={item.term}>
              <dt>
                <code>{item.term}</code>
              </dt>
              <dd>{item.text}</dd>
            </div>
          ))}
        </dl>
      );
    case 'code':
      return (
        <pre class="help-code" tabIndex={0}>
          <code>{block.code}</code>
        </pre>
      );
  }
}

function Keys({ combos }: { readonly combos: readonly KeyCombo[] }) {
  return (
    <span class="help-keys">
      {combos.map((combo, i) => (
        <span key={comboText(combo)} class="help-combo">
          {i > 0 && <span class="muted">{t('shortcuts.or')}</span>}
          <span class="help-combo-keys">
            {combo.map((key, j) => (
              <kbd key={`${j}-${key}`} class="kbd">
                {key}
              </kbd>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}

function Shortcuts() {
  return (
    <>
      <p>{t('help.shortcuts.intro')}</p>
      {shortcutGroups().map((group) => (
        <table key={group.id} class="help-shortcuts">
          <caption>{group.title}</caption>
          <tbody>
            {group.rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td>
                  <Keys combos={r.combos} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </>
  );
}

/** Guia interativo: o link (em outra aba) e como ver o mesmo projeto na app. */
function GuideUsage() {
  const url = guideUrl();
  return (
    <>
      <p>{t('help.guide.intro')}</p>
      {url !== null ? (
        <p>
          <LinkButton href={url}>
            <Icon name="info" />
            {t('help.guide.open')}
          </LinkButton>
        </p>
      ) : (
        <p class="muted">{t('help.guide.fileProtocol')}</p>
      )}
      <p class="muted">{t('help.guide.example')}</p>
    </>
  );
}

const CODE_HELP_KEYS = [
  'help.code.definition',
  'help.code.open',
  'help.code.copy',
  'help.code.repos',
] as const satisfies readonly TranslationKey[];

const PROPOSALS_HELP_KEYS = [
  'help.proposals.arrive',
  'help.proposals.review',
  'help.proposals.decide',
  'help.proposals.details',
  'help.proposals.apply',
  'help.proposals.resume',
] as const satisfies readonly TranslationKey[];

/** Change proposals: how they arrive, review, decisions, notes, applying and resuming. */
function ProposalsUsage() {
  return (
    <>
      <p>{t('help.proposals.intro')}</p>
      <ul>
        {PROPOSALS_HELP_KEYS.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ul>
    </>
  );
}

/** Use of platforms and of `code` in the app (the format stays in Specializations). */
function CodeUsage() {
  return (
    <>
      <p>{t('help.code.intro')}</p>
      <ul>
        {CODE_HELP_KEYS.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ul>
    </>
  );
}

function Downloads() {
  return (
    <>
      <p>{t('help.specs.downloadsHint')}</p>
      <div class="dialog-stack">
        {HELP_ASSETS.map((asset) => (
          <Button key={asset.id} onClick={() => downloadHelpAsset(asset)}>
            {t(`help.specs.download.${asset.id}` satisfies TranslationKey)}
          </Button>
        ))}
      </div>
      <p class="muted">{t('help.specs.applyHint')}</p>
    </>
  );
}

/** A Help topic: entry of the side index and section of the content. */
interface Topic {
  readonly id: string;
  readonly title: string;
  /** Todo o texto do assunto, para a busca. */
  readonly text: string;
  readonly body: ComponentChildren;
}

function topics(): readonly Topic[] {
  const specs = specHelpSections(locale.value).map((section, index): Topic => ({
    id: section.id,
    title: section.title,
    text:
      section.blocks.map(blockText).join(' ') +
      (index === 0 ? ` ${t('help.specs.intro')}` : ''),
    body: (
      <>
        {index === 0 && <p class="muted">{t('help.specs.intro')}</p>}
        {section.blocks.map((block, i) => (
          <Block key={i} block={block} />
        ))}
      </>
    ),
  }));
  const keys = shortcutGroups().flatMap((g) =>
    g.rows.map((r) => `${r.label} ${r.combos.map(comboText).join(' ')}`),
  );
  return [
    {
      id: HELP_GUIDE,
      title: t('help.guide.title'),
      text: [t('help.guide.intro'), t('help.guide.example'), t('help.guide.open')].join(
        ' ',
      ),
      body: <GuideUsage />,
    },
    ...specs,
    {
      id: 'code-usage',
      title: t('help.code.title'),
      text: [t('help.code.intro'), ...CODE_HELP_KEYS.map((key) => t(key))].join(' '),
      body: <CodeUsage />,
    },
    {
      id: HELP_PROPOSALS,
      title: t('help.proposals.title'),
      text: [t('help.proposals.intro'), ...PROPOSALS_HELP_KEYS.map((key) => t(key))].join(
        ' ',
      ),
      body: <ProposalsUsage />,
    },
    {
      id: 'downloads',
      title: t('help.specs.downloads'),
      text: `${t('help.specs.downloadsHint')} ${t('help.specs.applyHint')}`,
      body: <Downloads />,
    },
    {
      id: HELP_SHORTCUTS,
      title: t('help.shortcuts.title'),
      text: `${t('help.shortcuts.intro')} ${keys.join(' ')}`,
      body: <Shortcuts />,
    },
  ];
}

/** Scrolls to the section without changing the URL hash (the app does not use routing). */
function scrollToTopic(content: HTMLElement | null, id: string): void {
  content?.querySelector(`[id="help-${id}"]`)?.scrollIntoView?.({ block: 'start' });
}

interface HelpDialogProps {
  readonly onClose: () => void;
  /** Section where Help opens (default: the start). */
  readonly section?: string;
}

/**
 * Help: side index with search and the Specializations sections (concept, format,
 * references and downloads) and Keyboard shortcuts (P10).
 */
export function HelpDialog({ onClose, section }: HelpDialogProps) {
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState(section ?? null);
  const content = useRef<HTMLDivElement>(null);

  // Opens straight on the requested section (the list only exists after mounting).
  useEffect(() => {
    if (section) scrollToTopic(content.current, section);
  }, [section]);

  // The sections only change with the language: the search (on every key) does not recreate them.
  const language = locale.value;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `topics` reads the language through `t()`.
  const all = useMemo(() => topics(), [language]);
  const shown = all.filter((topic) =>
    matchesSearch(`${topic.title} ${topic.text}`, query),
  );

  return (
    <Dialog
      title={t('help.title')}
      size="lg"
      flush
      onCancel={onClose}
      actions={<Button onClick={onClose}>{t('common.close')}</Button>}
    >
      <div class="help">
        <div class="help-side">
          <TextField
            type="search"
            aria-label={t('help.search')}
            placeholder={t('help.search')}
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          <nav aria-label={t('help.specs.contents')}>
            <ul class="help-toc">
              {shown.map((topic) => (
                <li key={topic.id}>
                  <a
                    href={`#help-${topic.id}`}
                    aria-current={current === topic.id ? 'true' : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      setCurrent(topic.id);
                      scrollToTopic(content.current, topic.id);
                    }}
                  >
                    {topic.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div class="help-content" ref={content}>
          {shown.length === 0 ? (
            <p class="muted">{t('help.noResults', { query: query.trim() })}</p>
          ) : (
            shown.map((topic) => (
              <section key={topic.id} id={`help-${topic.id}`}>
                <h3>{topic.title}</h3>
                {topic.body}
              </section>
            ))
          )}
        </div>
      </div>
    </Dialog>
  );
}
