import { t, type TranslationKey } from '../i18n';
import {
  highestNotice,
  sortNotices,
  typeNotices,
  type SpecAnnotationType,
  type SpecNotice,
  type SpecNoticeKind,
} from '../model';
import { Tooltip } from './controls';
import { Icon, type IconName } from './icons';

// Aviso da especialização (formatVersion 10, etapa #486): o selo (pílula com ícone e rótulo),
// o bloco do tipo e a linha do campo ou da coluna. A cor vem do `kind` (tokens, no CSS) e vai
// sempre com ícone e texto. Só informa: nada aqui bloqueia nem vira pendência.

const ICONS: Record<SpecNoticeKind, IconName> = {
  removed: 'blocked',
  deprecated: 'warning',
  diverges: 'compare',
  pending: 'info',
};

/** O ícone do `kind` (o mesmo no selo, no bloco e no rótulo do campo). */
export function noticeIcon(kind: SpecNoticeKind): IconName {
  return ICONS[kind];
}

/** O rótulo traduzido do `kind`. */
export function noticeKindLabel(kind: SpecNoticeKind): string {
  return t(`notice.kind.${kind}` as TranslationKey);
}

/** Nome acessível do aviso: "Aviso <rótulo>: <mensagem>". */
export function noticeName(notice: SpecNotice): string {
  return t('notice.badge', {
    kind: noticeKindLabel(notice.kind),
    message: notice.message,
  });
}

interface BadgeProps {
  readonly notice: SpecNotice;
  /** Texto da dica; sem ele, a mensagem do aviso. */
  readonly tip?: string;
}

/** O selo: pílula do `kind`; a dica traz a mensagem. */
export function NoticeBadge({ notice, tip }: BadgeProps) {
  return (
    <Tooltip label={tip ?? notice.message}>
      <span
        class={`notice-badge notice-${notice.kind}`}
        role="img"
        aria-label={noticeName(notice)}
      >
        <Icon name={ICONS[notice.kind]} />
        {noticeKindLabel(notice.kind)}
      </span>
    </Tooltip>
  );
}

/**
 * O selo de um tipo: o aviso de maior gravidade entre o do tipo, os dos campos e os das
 * colunas; a dica lista todos. Nada num tipo sem aviso.
 */
export function TypeNoticeBadge({ type }: { readonly type: SpecAnnotationType }) {
  const top = highestNotice(type);
  if (!top) return null;
  const tip = sortNotices(typeNotices(type))
    .map((n) => `${noticeKindLabel(n.kind)}: ${n.message}`)
    .join(' · ');
  return <NoticeBadge notice={top} tip={tip} />;
}

/** `since` e `ref` do aviso (o `ref` em fonte mono). */
function NoticeOrigin({ notice }: { readonly notice: SpecNotice }) {
  return (
    <>
      {notice.since && (
        <span class="notice-since">{t('notice.since', { date: notice.since })}</span>
      )}
      {notice.ref && (
        <span class="notice-origin">
          {t('notice.ref')} <span class="notice-ref">{notice.ref}</span>
        </span>
      )}
    </>
  );
}

/** O aviso do tipo no topo da anotação: ícone, rótulo, mensagem e, se houver, `since` e `ref`. */
export function NoticeBlock({ notice }: { readonly notice: SpecNotice }) {
  return (
    <div
      class={`notice-block notice-${notice.kind}`}
      role="note"
      aria-label={noticeName(notice)}
    >
      <span class="notice-head">
        <Icon name={ICONS[notice.kind]} />
        <strong>{noticeKindLabel(notice.kind)}</strong>
      </span>
      <span class="notice-message">{notice.message}</span>
      <NoticeOrigin notice={notice} />
    </div>
  );
}

/** O aviso de um campo, ou de uma coluna (com `column`): uma linha com o fundo do `kind`. */
export function NoticeLine({
  notice,
  column,
}: {
  readonly notice: SpecNotice;
  readonly column?: string;
}) {
  const message = column
    ? t('notice.column', { column, message: notice.message })
    : notice.message;
  return (
    <p
      class={`notice-line notice-${notice.kind}`}
      role="note"
      aria-label={noticeName(notice)}
    >
      <Icon name={ICONS[notice.kind]} />
      <span class="notice-message">{message}</span>
      <NoticeOrigin notice={notice} />
    </p>
  );
}

/** As linhas de aviso de um campo e das suas colunas (tabela), na ordem de exibição. */
export function NoticeLines({
  notices,
  column,
}: {
  readonly notices: readonly SpecNotice[] | undefined;
  readonly column?: string;
}) {
  if (!notices || notices.length === 0) return null;
  return (
    <>
      {sortNotices(notices).map((notice, index) => (
        <NoticeLine key={`${notice.kind}-${index}`} notice={notice} column={column} />
      ))}
    </>
  );
}

/** O ícone do aviso mais grave no rótulo do campo. */
export function NoticeLabelIcon({
  notices,
}: {
  readonly notices: readonly SpecNotice[] | undefined;
}) {
  const top = notices ? sortNotices(notices)[0] : undefined;
  if (!top) return null;
  return (
    <span class={`notice-label-icon notice-${top.kind}`} aria-hidden="true">
      <Icon name={ICONS[top.kind]} />
    </span>
  );
}
