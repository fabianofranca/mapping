import { t, type TranslationKey } from '../i18n';
import { specHelpSections, type HelpBlock } from '../i18n/specHelp';
import { locale } from '../store/settings';
import { Dialog } from './Dialog';
import { downloadHelpAsset, HELP_ASSETS } from './helpAssets';

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

/** Ajuda → Especializações: conceito, formato, referências e downloads. */
export function SpecHelpDialog({ onClose }: { readonly onClose: () => void }) {
  const sections = specHelpSections(locale.value);
  return (
    <Dialog
      title={t('help.specs.title')}
      onCancel={onClose}
      actions={
        <button type="button" class="button" onClick={onClose}>
          {t('common.close')}
        </button>
      }
    >
      <div class="help">
        <p class="muted">{t('help.specs.intro')}</p>
        <nav aria-label={t('help.specs.contents')}>
          <ul class="help-toc">
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#help-${section.id}`} onClick={(e) => scrollTo(e, section.id)}>
                  {section.title}
                </a>
              </li>
            ))}
            <li>
              <a href="#help-downloads" onClick={(e) => scrollTo(e, 'downloads')}>
                {t('help.specs.downloads')}
              </a>
            </li>
          </ul>
        </nav>
        {sections.map((section) => (
          <section key={section.id} id={`help-${section.id}`}>
            <h3>{section.title}</h3>
            {section.blocks.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </section>
        ))}
        <section id="help-downloads">
          <h3>{t('help.specs.downloads')}</h3>
          <p>{t('help.specs.downloadsHint')}</p>
          <div class="dialog-stack">
            {HELP_ASSETS.map((asset) => (
              <button
                type="button"
                class="button"
                key={asset.id}
                onClick={() => downloadHelpAsset(asset)}
              >
                {t(`help.specs.download.${asset.id}` satisfies TranslationKey)}
              </button>
            ))}
          </div>
          <p class="muted">{t('help.specs.applyHint')}</p>
        </section>
      </div>
    </Dialog>
  );
}

/** Rola até a seção sem mudar o hash da URL (o app não usa roteamento). */
function scrollTo(e: Event, id: string): void {
  e.preventDefault();
  document.getElementById(`help-${id}`)?.scrollIntoView({ block: 'start' });
}
