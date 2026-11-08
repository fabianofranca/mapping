// Regras do extrator para o modo revisão (src/ui/review/*, app 0.25.0). Serializadas: nada de fora da função.
export const rules = [
  // Texto cortado com reticências (text-overflow: ellipsis) nas linhas e na barra da revisão: o Texto com
  // reticencias "sim" e a largura da caixa onde o app corta (o extrator padrão mede só o texto inteiro).
  (el, cs, h) => {
    if (cs.textOverflow !== 'ellipsis' || cs.overflowX === 'visible') return undefined;
    if (!el.closest('.proposal-row, .review-bar, .review-row, .other-change-row')) return undefined;
    if (el.scrollWidth <= el.clientWidth + 0.5) return undefined;
    const t = h.directText(el);
    if (!t || el.children.length) return undefined;
    const b = el.getBoundingClientRect();
    const left = b.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
    const right = b.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
    const r = h.clip(new DOMRect(Math.floor(left), t.rect.top, Math.ceil(right) - Math.floor(left), t.rect.height), el, true);
    if (!r) return 'stop';
    h.items.push({
      type: 'text',
      name: t.text.slice(0, 60),
      rect: r,
      values: { texto: t.text, estilo: h.textStyle(cs), cor: h.near(cs.color, h.cor) ?? 'text', alinhamento: 'left', decoracao: 'none', quebra: 'não', reticencias: 'sim' },
    });
    return 'stop';
  },
  // Átomos: DecisionMark, ChangeKind, Flag, ChangeMark, DiffValue.
  (el, cs, h) => {
    if (!el.matches('.decision-mark')) return undefined;
    const map = { undecided: 'sem-decisao', accepted: 'aceita', rejected: 'rejeitada', partial: 'parcial' };
    const estado = map[el.getAttribute('data-state')] ?? 'sem-decisao';
    h.push('decision-mark', el, { estado }, el.getAttribute('aria-label') || `Decisão: ${estado}`);
    return 'stop';
  },
  (el, cs, h) => {
    if (!el.matches('.change-kind')) return undefined;
    const map = { created: 'criada', removed: 'removida', moved: 'movida', changed: 'alterada', replaced: 'trocada' };
    const tipo = map[el.getAttribute('data-kind')] ?? 'alterada';
    h.push('change-kind', el, { tipo }, el.getAttribute('aria-label') || `Tipo: ${tipo}`);
    return 'stop';
  },
  (el, cs, h) => {
    if (!el.matches('.flag')) return undefined;
    const c = el.classList;
    const tom = c.contains('flag-warn') ? 'aviso' : c.contains('flag-danger') ? 'perigo' : c.contains('flag-ok') ? 'ok' : c.contains('flag-new') ? 'nova' : 'neutro';
    const texto = h.textOf(el);
    const icone = h.iconOf(el.querySelector('svg'));
    h.push('flag', el, { texto, tom, icone: icone ?? null }, texto);
    return 'stop';
  },
  (el, cs, h) => {
    if (!el.matches('.change-mark')) return undefined;
    const c = el.classList;
    const glyph = h.iconOf(el.querySelector(':scope > svg'));
    const byGlyph = { plus: 'criada', minus: 'removida', moved: 'movida', changed: 'alterada', replaced: 'trocada' };
    const label = el.getAttribute('aria-label') || '';
    const byWord = { novo: 'criada', removido: 'removida', movido: 'movida', alterado: 'alterada', trocado: 'trocada' };
    const word = /:\s*(novo|removido|movido|alterado|trocado)\b/.exec(label);
    const part = /^(Parte|Part)/.exec(label) ? (/remo/i.test(label) ? 'removida' : 'criada') : null;
    const tipo = byGlyph[glyph] ?? (word ? byWord[word[1]] : null) ?? part ?? 'alterada';
    const st = { undecided: 'sem-decisao', accepted: 'aceita', rejected: 'rejeitada' };
    h.push('change-mark', el, {
      tipo,
      estado: st[el.getAttribute('data-state')] ?? 'sem-decisao',
      conflito: h.sn(c.contains('is-conflict')),
      junto: h.sn(glyph === 'link'),
      parte: h.sn(c.contains('is-part')),
      aberto: h.sn(c.contains('is-open')),
      alvo: h.sn(c.contains('is-target')),
      invalido: h.sn(c.contains('is-invalid')),
    }, label.split('.')[0] || 'Marcador');
    return 'stop';
  },
  (el, cs, h) => {
    if (!el.matches('dl.diff-value')) return undefined;
    const kind = { 'diff-value-before': 'antes', 'diff-value-after': 'depois', 'diff-value-current': 'atual', 'diff-value-same': 'igual' };
    const linhas = [...el.querySelectorAll(':scope > .diff-value-row')].map((row) => {
      const dd = row.querySelector('dd');
      const k = [...(dd?.classList ?? [])].find((x) => kind[x]);
      return { tipo: kind[k] ?? 'antes', rotulo: h.textOf(row.querySelector('dt') ?? row), valor: dd ? h.textOf(dd) : '' };
    });
    h.push('diff-value', el, { linhas }, 'Valores');
    return 'stop';
  },
  // Molduras: ReviewBar, ReviewRow, ReviewHeader, ProposalRow, ChangePopover (desce nos filhos).
  (el, cs, h) => {
    if (el.matches('.review-bar')) {
      h.push('review-bar', el, {}, 'Barra da revisão');
      return 'group';
    }
    if (el.matches('.review-row')) {
      const label = h.textOf(el.querySelector('.review-row-label') ?? el);
      h.push('review-row', el, { selecionada: h.sn(el.classList.contains('review-row-selected')), invalida: h.sn(el.classList.contains('is-invalid')) }, `Linha ${label}`);
      return 'group';
    }
    if (el.matches('.review-header')) {
      h.push('review-header', el, {}, 'Cabeçalho da revisão');
      return 'group';
    }
    if (el.matches('.proposal-row')) {
      const title = h.textOf(el.querySelector('.proposal-row-title b') ?? el);
      h.push('proposal-row', el, {}, `Proposta ${title}`);
      return 'group';
    }
    if (el.matches('.popover.change-popover')) {
      // O popover é fixo na tela mas mora, no DOM, dentro da janela Detalhes (que rola): o retângulo vem
      // da própria caixa, sem o recorte dos ancestrais.
      const r = el.getBoundingClientRect();
      h.push('change-popover', el, {}, `Popover ${el.getAttribute('aria-label') || ''}`.trim(), {
        x: Math.round(r.left - h.O.left),
        y: Math.round(r.top - h.O.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      });
      return 'group';
    }
    return undefined;
  },
  // Estruturais: DecisionControl, ChangeBelow, NoteField, a seção Outras mudanças / Imagens.
  (el, cs, h) => {
    if (el.matches('.decision-control')) {
      h.push('decision-control', el, {}, `Decisão ${el.getAttribute('aria-label') || ''}`.trim());
      return 'group';
    }
    if (el.matches('.change-below')) {
      h.push('change-below', el, {}, 'Embaixo do campo');
      return 'group';
    }
    if (el.matches('.review-note-field')) {
      h.push('note-field', el, {}, 'Nota para o agente');
      return 'group';
    }
    if (el.matches('.details-section') && el.querySelector(':scope > .details-section-body > .other-changes')) {
      h.push('other-changes', el, {}, el.getAttribute('aria-label') || 'Outras mudanças');
      return 'group';
    }
    if (el.matches('.image-compare-stage')) {
      h.push('image-compare', el, { modo: 'deslizar' }, 'Comparação');
      return 'stop';
    }
    return undefined;
  },
  // Peças da revisão sem tipo próprio: o selo REVISÃO (texto em maiúsculas pelo CSS), o progresso e as
  // faixas de grupo com as duas divisórias (cima e baixo).
  (el, cs, h) => {
    if (el.matches('.review-badge')) {
      h.push('box', el, { fundo: 'accent', borda: 'nenhuma', lados: 'todos', raio: 'xs', sombra: 'nenhuma' }, 'Selo REVISÃO');
      const svg = el.querySelector('svg');
      if (svg) h.push('icon', svg, { icone: h.iconOf(svg) ?? 'proposal', cor: 'accent-text' }, 'proposal');
      const t = h.directText(el);
      if (t) {
        const r = t.rect;
        const O = h.O;
        h.push('text', el, { texto: t.text.toLocaleUpperCase('pt-BR'), estilo: 't-micro', cor: 'accent-text', alinhamento: 'left', decoracao: 'none', quebra: 'não' }, t.text, {
          x: Math.floor(r.left - O.left),
          y: Math.round(r.top - O.top),
          width: Math.ceil(r.right) - Math.floor(r.left),
          height: Math.round(r.height),
        });
      }
      return 'stop';
    }
    if (el.matches('.review-progress')) {
      h.push('box', el, { fundo: 'surface', borda: 'control', lados: 'todos', raio: 'full', sombra: 'nenhuma' }, 'Progresso');
      for (const i of el.querySelectorAll('i')) {
        if (i.getBoundingClientRect().width < 1) continue;
        h.push('box', i, { fundo: i.matches('.review-progress-yes') ? 'success-bg' : 'danger-bg', borda: 'nenhuma', lados: 'todos', raio: '0', sombra: 'nenhuma' }, 'Parte do progresso');
      }
      return 'stop';
    }
    if (el.matches('.review-group, .review-levels-head')) {
      const r = el.getBoundingClientRect();
      const O = h.O;
      h.push('box', el, { fundo: 'bg', borda: 'border', lados: 'cima', raio: '0', sombra: 'nenhuma' }, el.matches('.review-group') ? 'Grupo' : 'Cabeçalho dos níveis');
      h.push('box', el, { fundo: 'nenhum', borda: 'border', lados: 'baixo', raio: '0', sombra: 'nenhuma' }, 'Divisória de baixo', {
        x: Math.round(r.left - O.left),
        y: Math.round(r.bottom - O.top) - 1,
        width: Math.round(r.width),
        height: 1,
      });
      return 'group';
    }
    return undefined;
  },
];
