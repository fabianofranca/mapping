import { changeNotices, compareNotices, type Change } from '../../model';
import { useEditor } from '../EditorContext';
import { NoticeLine } from '../NoticeBadge';

// Avisos da especialização na revisão (etapa #486, decisão 10): logo abaixo da mudança que
// cria uma anotação de tipo com aviso, troca o tipo ou grava valor num campo ou coluna com aviso,
// no estilo do `kind`. Só informam: Aceitar e Aplicar não dependem deles.

export function ChangeNotices({
  change,
  field,
}: {
  readonly change: Change;
  /** Campo mostrado no marcador (`''`: a anotação inteira). */
  readonly field: string;
}) {
  const { review } = useEditor();
  // A prévia com todas as mudanças não aplicadas: o aviso aparece também na rejeitada.
  const preview = review.derived.fullPreview.value;
  if (!preview) return null;
  const usages = [...changeNotices(preview, change, field)].sort((a, b) =>
    compareNotices(a.notice, b.notice),
  );
  if (usages.length === 0) return null;
  return (
    <div class="change-notices">
      {usages.map((usage, index) => (
        <NoticeLine
          key={`${usage.notice.kind}-${index}`}
          notice={usage.notice}
          column={usage.scope === 'column' ? usage.column : undefined}
        />
      ))}
    </div>
  );
}
