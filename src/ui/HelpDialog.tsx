import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { t, type TranslationKey } from '../i18n';
import { specHelpSections, type HelpBlock } from '../i18n/specHelp';
import { locale } from '../store/settings';
import { Dialog } from './Dialog';
import { downloadHelpAsset, HELP_ASSETS } from './helpAssets';
import { matchesSearch } from '../utils/search';
import { blockText } from './helpText';
import { Button, TextField } from './controls';
import { comboText, shortcutGroups, type KeyCombo } from './shortcutList';

/** Id da seção Atalhos, para abrir a Ajuda direto nela (Configurações → atalhos). */
export const HELP_SHORTCUTS = 'shortcuts';

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

/** Um assunto da Ajuda: entrada do índice lateral e seção do conteúdo. */
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
    ...specs,
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

/** Rola até a seção sem mudar o hash da URL (o app não usa roteamento). */
function scrollToTopic(id: string): void {
  document.getElementById(`help-${id}`)?.scrollIntoView?.({ block: 'start' });
}

interface HelpDialogProps {
  readonly onClose: () => void;
  /** Seção em que a Ajuda abre (padrão: o começo). */
  readonly section?: string;
}

/**
 * Ajuda: índice lateral com busca e as seções Especializações (conceito, formato,
 * referências e downloads) e Atalhos de teclado (P10).
 */
export function HelpDialog({ onClose, section }: HelpDialogProps) {
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState(section ?? null);

  // Abre direto na seção pedida (a lista só existe depois da montagem).
  useEffect(() => {
    if (section) scrollToTopic(section);
  }, [section]);

  const shown = topics().filter((topic) =>
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
                      scrollToTopic(topic.id);
                    }}
                  >
                    {topic.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div class="help-content">
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
