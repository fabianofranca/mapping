// Regras do extrator do grupo "dialogos" (rodam antes das do shots/extractor.mjs, no DOM do app 0.25.0).
// Serializadas com String(fn): nada de fora da função.
export const rules = [
  // 1. A moldura dos diálogos com componente próprio (no lugar do Dialog genérico). Marca o <dialog> com
  //    data-dlg para as regras dos filhos saberem que estão num diálogo do grupo.
  (el, cs, h) => {
    if (!el.matches('dialog.dialog')) return undefined;
    const title = h.textOf(el.querySelector('.dialog-title') || el);
    const closable = Boolean(el.querySelector('.dialog-header .icon-button'));
    let type = null;
    if (el.querySelector('.dialog-body > .help')) type = 'help-dialog';
    else if (el.querySelector('#container-form')) type = 'container-dialog';
    else if (title === 'Projeto com dados inconsistentes') type = 'inconsistent-project-dialog';
    else if (title === 'Especializações' || /^(Pacote ".*"|Pacote de especialização inválido|Atualizar ".*"\?|Remover ".*"\?|Arquivo de especialização inválido|Nada a fazer)$/.test(title)) type = 'specs-dialog';
    else if (/^(Excluir container\?|Excluir marcação\?|Excluir seta\?|Excluir \d+ itens\?|Fechar sem salvar\?|Proporção diferente|Projeto alterado fora da app)$/.test(title)) type = 'confirm-dialogs';
    if (!type) return undefined;
    el.setAttribute('data-dlg', type);
    const values = { titulo: title };
    if (type === 'confirm-dialogs') values.fechavel = h.sn(closable);
    h.push(type, el, values, title);
    return 'group';
  },

  // 2. O rodapé e o índice da Ajuda: as divisórias são da moldura (não viram Caixa); os filhos seguem.
  (el) => {
    if (el.matches('.dialog-actions, .help-side') && el.closest('[data-dlg]')) return 'group';
    return undefined;
  },

  // 3. O marcador de um item de lista (::marker, fora da caixa do li): um Texto à esquerda da primeira
  //    linha. O número ("1.") é texto, alinhado à direita antes do espaço que o separa do item. O disco e
  //    o círculo o Chromium pinta como forma (5 e 7 px a 13 px de fonte, centro 14 e 15 px antes do item):
  //    o "•" e o "◦" do t-display (20 px) têm esse tamanho.
  (el, cs, h) => {
    if (el.tagName !== 'LI' || !el.closest('[data-dlg]')) return undefined;
    const type = cs.listStyleType;
    if (!type || type === 'none' || cs.listStylePosition !== 'outside') return undefined;
    const list = el.parentElement;
    const r = el.getBoundingClientRect();
    const size = parseFloat(cs.fontSize);
    const lh = parseFloat(cs.lineHeight) || size * 1.4;
    const values = (texto, estilo) => ({ texto, estilo, cor: h.near(cs.color, h.cor) || 'text', alinhamento: 'left', decoracao: 'none', quebra: 'não' });
    if (type === 'decimal') {
      const start = list && list.tagName === 'OL' ? Number(list.getAttribute('start') || 1) : 1;
      const mark = `${start + [...list.children].filter((c) => c.tagName === 'LI').indexOf(el)}.`;
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const full = ctx.measureText(`${mark} `).width;
      const w = ctx.measureText(mark).width;
      const left = Math.floor(r.left - full);
      const rect = h.clip(new DOMRect(left, r.top, Math.ceil(r.left - full + w) - left, lh), list, true);
      if (rect) h.push('text', el, values(mark, h.textStyle(cs)), `marcador ${mark}`, rect);
      return undefined;
    }
    const mark = type === 'disc' ? '•' : type === 'circle' ? '◦' : null;
    if (!mark) return undefined;
    const k = size / 13;
    // Centro do desenho do Chromium e, no Texto de 20 px (linha de 28), onde fica o centro da tinta do glifo.
    const cx = r.left - (type === 'disc' ? 14 : 15) * k;
    const cy = r.top + lh / 2;
    const ink = type === 'disc' ? { x: 4, y: 14 } : { x: 3.5, y: 16 };
    const box = new DOMRect(Math.round(cx - ink.x), Math.round(cy - ink.y), 9, 28);
    const rect = h.clip(box, list, true);
    if (rect) h.push('text', el, values(mark, 't-display'), `marcador ${mark}`, rect);
    return undefined;
  },

  // 3b. Texto puro (sem elementos dentro) num diálogo do grupo. Como o extrator, mas com a altura das linhas:
  //     o extrator mede o retângulo dos glifos (17 px por linha de 20 a 13 px), e o parágrafo de N linhas
  //     ficava 3 px mais baixo que N linhas, e o Konva não desenhava a última. Junta os nós de texto sem
  //     espaço (o "(1)" do Preact são três nós).
  (el, cs, h) => {
    if (el.children.length || !el.closest('[data-dlg]')) return undefined;
    if (el.matches('button, .button, input, textarea, select, option, label, .dialog-title, .icon-button-text')) return undefined;
    if (el.closest('button, .button, .select, label.choice, .dialog-header')) return undefined;
    const nodes = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (!nodes.length) return undefined;
    // Com fundo ou borda própria (o .notice de um parágrafo, a tecla .kbd): a Caixa e o texto por cima. Os selos
    // e os chips ficam com o extrator.
    const own = h.boxOf(el, cs);
    if (own && el.matches('.tag, .badge, .thread-message-agent, .thread-state, .comments-badge, .tab-badge, .chip, .citation-chip, .notice-box, .thread-avatar, .comments-avatar')) return undefined;
    if (own) h.push('box', el, own, 'Caixa ' + h.nameOf(el));
    const texto = el.textContent.replace(/\s+/g, ' ').trim();
    const range = document.createRange();
    range.selectNodeContents(el);
    const tr = range.getBoundingClientRect();
    const rects = [...range.getClientRects()].filter((q) => q.width > 0.5);
    const tops = [];
    for (const q of rects) if (!tops.some((t) => Math.abs(t - q.top) < 2)) tops.push(q.top);
    const lines = Math.max(1, tops.length);
    const size = parseFloat(cs.fontSize);
    const lh = parseFloat(cs.lineHeight) || size * 1.4;
    let box;
    if (lines > 1) {
      let b = el;
      while (b.parentElement && /^inline/.test(getComputedStyle(b).display)) b = b.parentElement;
      const bs = getComputedStyle(b);
      const br = b.getBoundingClientRect();
      const left = Math.min(tr.left, br.left + parseFloat(bs.borderLeftWidth) + parseFloat(bs.paddingLeft));
      const right = Math.max(tr.right, br.right - parseFloat(bs.borderRightWidth) - parseFloat(bs.paddingRight));
      const first = rects[0];
      const top = first.top - (lh - first.height) / 2;
      box = new DOMRect(Math.floor(left), Math.floor(top), Math.ceil(right) - Math.floor(left), Math.ceil(top + lines * lh) - Math.floor(top));
    } else box = new DOMRect(Math.floor(tr.left), tr.top, Math.ceil(tr.right) - Math.floor(tr.left), tr.height);
    const rect = h.clip(box, el, true);
    if (!rect) return 'stop';
    const deco = /line-through/.test(cs.textDecorationLine) ? 'line-through' : /underline/.test(cs.textDecorationLine) ? 'underline' : 'none';
    const alinhamento = cs.textAlign === 'right' || cs.textAlign === 'end' ? 'right' : cs.textAlign === 'center' ? 'center' : 'left';
    h.push('text', el, { texto, estilo: h.textStyle(cs), cor: h.near(cs.color, h.cor) || 'text', alinhamento, decoracao: deco, quebra: lines > 1 ? 'sim' : 'não' }, texto.slice(0, 60), rect);
    return 'stop';
  },

  // 4. UpdateImpact: os parágrafos e listas que o fragmento põe no corpo do diálogo, de "Da versão N para a M."
  //    até antes da contagem de erros e avisos do pacote (ou até o fim, no Atualizar de arquivo único).
  (el, cs, h) => {
    if (!el.matches('.dialog-body') || !el.closest('[data-dlg="specs-dialog"]')) return undefined;
    const kids = [...el.children].filter((c) => h.shown(c));
    const start = kids.findIndex((c) => c.tagName === 'P' && /^Da versão \d+ para (a )?\d+\.$/.test(h.textOf(c)));
    if (start < 0) return undefined;
    let end = kids.findIndex((c, i) => i > start && (c.matches('.library-issues') || /^\d+ erro\(s\) e \d+ aviso\(s\)/.test(h.textOf(c))));
    if (end < 0) end = kids.length;
    const rs = kids.slice(start, end).map((c) => c.getBoundingClientRect());
    const x1 = Math.min(...rs.map((r) => r.left));
    const y1 = Math.min(...rs.map((r) => r.top));
    const x2 = Math.max(...rs.map((r) => r.right));
    const y2 = Math.max(...rs.map((r) => r.bottom));
    const rect = h.clip(new DOMRect(x1, y1, x2 - x1, y2 - y1), el, true);
    if (rect) h.push('update-impact', el, {}, 'Impacto da atualização', rect);
    return undefined;
  },

  // 5. LibraryIssueList: a caixa com borda e raio (os grupos, títulos e linhas são filhos).
  (el, cs, h) => {
    if (!el.matches('.library-issues')) return undefined;
    h.push('library-issue-list', el, {}, 'Problemas da biblioteca');
    return 'group';
  },

  // 6. Uma linha da lista de problemas: o selo (aviso = Selo preview; erro = Caixa danger-bg e Texto danger),
  //    o caminho (Texto t-code) e a mensagem (Texto parágrafo com o lugar do selo e do caminho, como o
  //    chip de citação do extrator: U+2060 e espaços não separáveis).
  (el, cs, h) => {
    if (!el.matches('li.library-issue')) return undefined;
    const badge = el.querySelector('.badge');
    const code = el.querySelector(':scope > code');
    if (badge) {
      const label = h.textOf(badge);
      if (badge.classList.contains('library-issue-error')) {
        h.push('box', badge, { fundo: 'danger-bg', borda: 'danger', lados: 'todos', raio: 'sm', sombra: 'nenhuma' }, `Selo ${label}`);
        const bcs = getComputedStyle(badge);
        const range = document.createRange();
        range.selectNodeContents(badge);
        const tr = range.getBoundingClientRect();
        const box = new DOMRect(Math.floor(tr.left), tr.top, Math.ceil(tr.right) - Math.floor(tr.left), tr.height);
        h.push('text', badge, { texto: label, estilo: h.textStyle(bcs), cor: 'danger', alinhamento: 'left', decoracao: 'none', quebra: 'não' }, label, h.clip(box, badge, true));
      } else h.push('badge', badge, { texto: label, estilo: 'preview' }, label);
    }
    if (code) {
      const ccs = getComputedStyle(code);
      const r = code.getBoundingClientRect();
      const box = new DOMRect(Math.floor(r.left), r.top, Math.ceil(r.right) - Math.floor(r.left), r.height);
      h.push('text', code, { texto: h.textOf(code), estilo: h.textStyle(ccs), cor: h.near(ccs.color, h.cor) || 'text', alinhamento: 'left', decoracao: 'none', quebra: 'não' }, h.textOf(code), h.clip(box, code, true));
    }
    const nodes = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (nodes.length) {
      const message = nodes.map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
      const lead = code || badge;
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const space = ctx.measureText(' ').width || 3.5;
      const r = el.getBoundingClientRect();
      const before = lead ? lead.getBoundingClientRect().right - r.left : 0;
      const texto = (lead ? '⁠' + ' '.repeat(Math.max(1, Math.round(before / space))) + ' ' : '') + message;
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
      const lines = Math.max(1, Math.round(r.height / lh));
      const box = new DOMRect(Math.floor(r.left), r.top, Math.ceil(r.right) - Math.floor(r.left), r.height);
      h.push('text', el, { texto, estilo: h.textStyle(cs), cor: h.near(cs.color, h.cor) || 'text', alinhamento: 'left', decoracao: 'none', quebra: lines > 1 ? 'sim' : 'não' }, message.slice(0, 60), h.clip(box, el, true));
    }
    return 'stop';
  },

  // 7. Uma plataforma da especialização: o nome, o link do repositório (sublinhado, accent) e a referência
  //    são textos separados (o extrator juntaria tudo num parágrafo de uma cor só).
  (el, cs, h) => {
    if (!el.matches('.spec-platforms li') || !el.closest('[data-dlg]')) return undefined;
    const dt = h.directText(el);
    if (dt) {
      const r = dt.rect;
      const box = new DOMRect(Math.floor(r.left), r.top, Math.ceil(r.right) - Math.floor(r.left), r.height);
      h.push('text', el, { texto: dt.text, estilo: h.textStyle(cs), cor: h.near(cs.color, h.cor) || 'text', alinhamento: 'left', decoracao: 'none', quebra: 'não' }, dt.text, h.clip(box, el, true));
    }
    for (const c of el.children) h.walk(c);
    return 'stop';
  },
];
