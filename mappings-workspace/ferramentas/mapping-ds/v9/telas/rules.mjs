// Regras do extrator para os tipos do grupo "telas". Rodam antes das do shots/extractor.mjs e são
// serializadas (String(fn)): nada de variáveis de fora da função.
export const rules = [
  // Home: a tela inicial desenha o fundo e a coluna lateral (a .home-side não vira Caixa; os filhos dela, sim).
  (el, cs, h) => {
    if (el.matches('.home')) {
      h.push('home', el, {}, 'Tela inicial');
      return 'group';
    }
    if (el.matches('.home-side')) {
      for (const c of el.children) h.walk(c);
      return 'stop';
    }
    return undefined;
  },
  // NarrowWindow: o aviso no lugar da tela; título e texto são filhos.
  (el, cs, h) => {
    if (!el.matches('.narrow-window')) return undefined;
    h.push('narrow-window', el, {}, 'Abra numa janela maior');
    return 'group';
  },
  // CatalogScreen: o fundo e a divisória da barra (a barra não vira Caixa; Voltar, nome e versão são filhos).
  (el, cs, h) => {
    if (el.matches('.catalog-screen')) {
      h.push('catalog-screen', el, {}, 'Catálogo da biblioteca');
      return 'group';
    }
    if (el.matches('.catalog-screen-bar')) {
      for (const c of el.children) h.walk(c);
      return 'stop';
    }
    return undefined;
  },
  // CatalogWindow e CatalogPage: agrupadores (sem fundo nem borda no app). Os dois passam da área que
  // rola (a lista e a página são mais altas que a janela e o diálogo): a marcação é a parte à vista.
  (el, cs, h) => {
    const page = el.matches('.catalog-page');
    if (!page && !el.matches('.catalog-window')) return undefined;
    const rect = h.clip(el.getBoundingClientRect(), el);
    if (!rect) return 'stop';
    if (page) h.push('catalog-page', el, {}, `Página ${h.textOf(el.querySelector('.catalog-page-name') ?? el).slice(0, 40)}`, rect);
    else h.push('catalog-window', el, {}, 'Catálogo', rect);
    return 'group';
  },
  // NoticesView: a moldura com a divisória dos filtros (a barra de filtros não vira Caixa).
  (el, cs, h) => {
    if (el.matches('.tool-window[data-window=notices] .list-view')) {
      h.push('notices-view', el, {}, 'Avisos');
      return 'group';
    }
    if (el.matches('.tool-window[data-window=notices] .list-filters')) {
      for (const c of el.children) h.walk(c);
      return 'stop';
    }
    return undefined;
  },
  // TreeRow: a moldura da linha (fundo do estado e raio); o chevron, o ícone, o texto, os pontos das
  // camadas, o cadeado e o menu continuam filhos.
  (el, cs, h) => {
    if (!el.matches('.tree-row')) return undefined;
    // O estado pela cor calculada: a linha atual só fica em color-accent com o foco na árvore; fora dele,
    // o app a pinta de color-selection-muted.
    const bg = h.near(cs.backgroundColor, h.fundo);
    const estado = el.classList.contains('tree-row-current') ? (bg === 'accent' ? 'atual' : 'atual-sem-foco') : el.classList.contains('tree-row-selected') ? 'selecionada' : 'normal';
    h.push('tree-row', el, { estado }, `Linha ${h.textOf(el).slice(0, 40)}`);
    return 'group';
  },
  // O nome na linha da árvore corta com "…" (.tree-label: text-overflow ellipsis): o Texto ganha
  // reticencias "sim" quando o texto passa do conteúdo da caixa (o critério do ops-v8, com tw e cw).
  (el, cs, h) => {
    if (!el.matches('.tree-row .tree-label')) return undefined;
    const dt = h.directText(el);
    if (!dt) return undefined;
    const box = el.getBoundingClientRect();
    const cw = box.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (dt.rect.width - cw <= 0.01) return undefined;
    const tr = dt.rect;
    const r = h.clip(new DOMRect(Math.floor(tr.left), tr.top, Math.ceil(tr.right) - Math.floor(tr.left), tr.height), el, true);
    if (!r) return 'stop';
    r.width = Math.max(1, Math.min(r.width, Math.round(cw), Math.ceil(tr.width) - 1));
    h.push('text', el, { texto: dt.text, estilo: h.textStyle(cs), cor: h.near(cs.color, h.cor) ?? 'text', alinhamento: 'left', decoracao: 'none', quebra: 'não', reticencias: 'sim' }, dt.text.slice(0, 60), r);
    Object.assign(h.items[h.items.length - 1], { lines: 1, tw: tr.width, cw, sw: el.scrollWidth, ci: el.clientWidth });
    return 'stop';
  },
  // Minimap: a moldura e, como filhas do mesmo tipo, as imagens e a vista (posições do app).
  (el, cs, h) => {
    if (!el.matches('.minimap')) return undefined;
    h.push('minimap', el, { parte: 'moldura' }, 'Minimapa');
    for (const c of el.children) {
      if (!h.shown(c)) continue;
      if (c.matches('.minimap-image')) h.push('minimap', c, { parte: 'imagem' }, 'Imagem no minimapa');
      else if (c.matches('.minimap-view')) h.push('minimap', c, { parte: 'vista' }, 'Área visível');
    }
    return 'stop';
  },
  // ZoomField: átomo (o botão com a porcentagem).
  (el, cs, h) => {
    if (!el.matches('.zoom-field')) return undefined;
    h.push('zoom-field', el, { valor: h.textOf(el) }, `Zoom ${h.textOf(el)}`);
    return 'stop';
  },
];
