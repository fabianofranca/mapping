// Regras do extrator para o grupo "detalhes" (v9): os painéis e campos dos Detalhes e do modo
// visualização no app 0.25.0. Uma função só (as regras são serializadas com String(fn), então os
// auxiliares ficam dentro dela). Devolve 'stop' (átomo, não desce), 'group' (moldura ou agrupador,
// desce nos filhos) ou undefined (não é deste grupo).
function detalhes(el, cs, h) {
  const hex = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return null;
    return '#' + m[1].split(',').slice(0, 3).map((s) => Math.round(parseFloat(s)).toString(16).padStart(2, '0')).join('').toUpperCase();
  };
  const transparent = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
  // Caixa de conteúdo (sem borda nem padding), em coordenadas da página.
  const content = (e) => {
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    const l = parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft);
    const rr = parseFloat(s.borderRightWidth) + parseFloat(s.paddingRight);
    return new DOMRect(r.left + l, r.top, r.width - l - rr, r.height);
  };
  // Arredonda para fora (o Konva quebra a última letra se a caixa ficar fração de px mais estreita).
  const out = (r) => new DOMRect(Math.floor(r.left), r.top, Math.ceil(r.right) - Math.floor(r.left), r.height);
  const color = (c) => h.near(c, h.cor) ?? 'text';
  const textAt = (e, texto, rect, extra = {}) => {
    const s = getComputedStyle(e);
    const r = h.clip(out(rect), e, true);
    if (!r || !texto) return false;
    return h.push('text', e, { texto, estilo: h.textStyle(s), cor: color(s.color), alinhamento: 'left', decoracao: 'none', quebra: 'não', ...extra }, texto, r);
  };
  const textNodeRect = (n) => {
    const range = document.createRange();
    range.selectNodeContents(n);
    return range.getBoundingClientRect();
  };
  // Ícones só de pontos (more, moreVertical, grip): não têm <path>, e o iconOf do extrator, que casa
  // pelo `d` dos caminhos, dá o mesmo nome aos três. Aqui eles saem pelos círculos.
  const dotIcon = (svg) => {
    if (!svg || svg.querySelector('path')) return null;
    const dots = [...svg.querySelectorAll('circle')];
    if (dots.length === 6) return 'grip';
    if (dots.length === 3) return new Set(dots.map((c) => c.getAttribute('cx'))).size === 1 ? 'moreVertical' : 'more';
    return null;
  };

  // ---- Ícones de pontos (correção do extrator, nas telas deste grupo).
  if (el.matches('.icon-button') && !el.closest('.tool-strip')) {
    const icone = dotIcon(el.querySelector('svg'));
    if (icone) {
      const label = el.getAttribute('aria-label') || el.getAttribute('title') || icone;
      const variant = ['danger', 'accept', 'reject'].find((v) => el.classList.contains(`icon-button-${v}`)) ?? 'default';
      h.push('icon-button', el, { icone, rotulo: label, texto: null, variant, size: el.classList.contains('icon-button-sm') ? 'sm' : 'md', pressionado: h.sn(el.getAttribute('aria-pressed') === 'true'), alerta: 'não', selo: null }, label);
      return 'stop';
    }
  }
  if (el.matches('svg')) {
    const icone = dotIcon(el);
    if (icone) {
      h.push('icon', el, { icone, cor: color(cs.color) }, icone);
      return 'stop';
    }
  }

  // ---- Painéis dos Detalhes (agrupadores: no app não têm fundo nem borda; a janela é que tem).
  if (el.matches('.panel-details')) {
    const arrow = Boolean(el.querySelector(':scope > section.details-section[aria-label="Seta"]'));
    h.push(arrow ? 'arrow-panel' : 'marking-panel', el, {}, arrow ? 'Detalhes da seta' : 'Detalhes da marcação');
    // O painel é estrutural; a divisória de cima (quando há) continua uma Caixa, como no extrator.
    const box = h.boxOf(el, cs);
    if (box) h.push('box', el, box, `Caixa ${h.nameOf(el)}`);
    return 'group';
  }
  if (el.matches('.details-empty') && el.querySelector('.multi-actions')) {
    h.push('multi-selection-panel', el, {}, h.textOf(el.querySelector('strong') ?? el));
    return 'group';
  }
  if (el.matches('.props')) {
    h.push('property-grid', el, {}, 'Propriedades');
    return 'group';
  }
  if (el.matches('.code-definitions')) {
    h.push('code-definitions', el, {}, 'Definição');
    return 'group';
  }

  // ---- Camadas: o grupo nos Detalhes, a linha da lista de camadas e o ponto da cor.
  if (el.matches('.layer-group')) {
    const head = el.querySelector(':scope > .layer-group-head');
    const stripe = /(rgba?\([^)]+\))/.exec(head ? getComputedStyle(head).boxShadow : '')?.[1];
    const name = h.textOf(el.querySelector('.layer-group-name') ?? el);
    // Cortado pela rolagem (o grupo começa acima da área visível), o desenho do grupo poria o
    // cabeçalho no lugar errado: fica com as regras comuns (Caixas), como antes.
    if (!h.push('layer-group', el, { forma: 'grupo', cor: hex(stripe) ?? '#1A63CC', aberto: h.sn(Boolean(el.querySelector(':scope > .layer-group-body'))) }, `Camada ${name}`)) return undefined;
    el.setAttribute('data-lg', '1');
    return 'group';
  }
  // Cabeçalho e corpo do grupo: o fundo, a faixa da cor e a divisória são do desenho do grupo.
  if (el.matches('.layer-group-head, .layer-group-body') && el.parentElement?.getAttribute('data-lg') === '1') return 'group';
  if (el.matches('.layer-row')) {
    const name = el.querySelector('.layer-name')?.value ?? '';
    // A lista rola: a última linha pode sair cortada embaixo (a marcação é a parte visível).
    h.push('layer-group', el, { forma: 'linha', cor: hex(cs.borderLeftColor) ?? '#1A63CC', aberto: 'não' }, `Camada ${name}`, h.clip(el.getBoundingClientRect(), el) ?? undefined);
    return 'group';
  }
  if (el.matches('.layer-dot')) {
    h.push('layer-group', el, { forma: 'ponto', cor: hex(cs.backgroundColor) ?? '#1A63CC', aberto: 'não' }, 'Cor da camada');
    return 'stop';
  }
  // A caixa de mostrar a camada (só o checkbox, sem texto à vista): Choice com o rótulo acessível,
  // no retângulo que põe o quadrado de 16 px onde ele está (o Choice tem 4 px de margem e 28 de altura).
  if (el.matches('label.layer-visible')) {
    const input = el.querySelector('input');
    if (!input) return 'stop';
    const r = input.getBoundingClientRect();
    const rect = h.clip(new DOMRect(r.left - 4, r.top - 6, 24, 28), el, true);
    h.push('choice', el, { tipo: 'checkbox', rotulo: input.getAttribute('aria-label') || 'Mostrar a camada', dica: null, marcado: h.sn(input.checked), rotuloVisivel: 'não' }, input.getAttribute('aria-label') || 'Mostrar', rect);
    return 'stop';
  }
  // Choice com o ponto da camada antes do nome (o painel Mostrar no canvas): o lugar do ponto no
  // rótulo é um word joiner (U+2060) e espaços não separáveis; o ponto é marcação própria.
  if (el.matches('label.choice') && el.querySelector('.layer-dot')) {
    const input = el.querySelector('input');
    const dot = el.querySelector('.layer-dot');
    const label = el.querySelector('.view-panel-layer') ?? el.querySelector('.choice-label');
    const textNode = [...label.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    const s = getComputedStyle(label);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const nb = ctx.measureText('\u00a0').width || 3.5;
    const gap = textNode ? textNodeRect(textNode).left - label.getBoundingClientRect().left : 18;
    const rotulo = '\u2060' + '\u00a0'.repeat(Math.max(1, Math.round(gap / nb))) + (textNode ? textNode.textContent.trim() : '');
    h.push('choice', el, { tipo: input?.type === 'radio' ? 'radio' : 'checkbox', rotulo, dica: null, marcado: h.sn(input?.checked) }, textNode ? textNode.textContent.trim() : 'Camada');
    h.walk(dot);
    return 'stop';
  }

  // ---- Grades: a anotação livre (KeyValueGrid) e o campo table (TableField). O cabeçalho é do desenho.
  if (el.matches('.grid.kv-grid, .grid.data-grid')) {
    const kv = el.matches('.kv-grid');
    h.push(kv ? 'key-value-grid' : 'data-grid', el, { cabecalho: h.sn(Boolean(el.querySelector(':scope > .grid-head'))) }, el.getAttribute('aria-label') || (kv ? 'Pares' : 'Linhas'));
    return 'group';
  }
  if (el.matches('.grid-head')) return 'group';
  // A linha da grade: a divisória embaixo (Caixa). A grade larga rola por dentro e a linha passa da caixa
  // visível: a marcação é a parte visível (o push sem retângulo descartaria a linha cortada).
  if (el.matches('.grid > .grid-row')) {
    const r = h.clip(el.getBoundingClientRect(), el);
    const line = parseFloat(cs.borderBottomWidth) >= 1 && cs.borderBottomStyle !== 'none';
    if (r && line) h.push('box', el, { fundo: 'nenhum', borda: 'border', lados: 'baixo', raio: '0', sombra: 'nenhuma' }, 'Linha da grade', r);
    return 'group';
  }

  // ---- Referência: o campo ref dos Detalhes e a célula ref da tabela. O controle (caixa, ícone, alvo e
  // camada) é do desenho; os IconButtons Ir para e Limpar são marcações filhas.
  if (el.matches('.ref-field')) {
    const control = el.querySelector(':scope > .ref-control');
    const c = control?.classList;
    const estado = !c ? 'valor' : c.contains('is-empty') ? 'vazio' : c.contains('is-broken') ? 'quebrado' : c.contains('input-invalid') ? 'invalido' : 'valor';
    const valor = h.textOf(el.querySelector('.ref-control-text') ?? el);
    const camada = el.querySelector('.ref-control-layer');
    const cell = el.matches('.ref-cell');
    const values = cell ? { valor, estado } : { valor, camada: camada ? h.textOf(camada) : null, estado };
    h.push(cell ? 'ref-cell' : 'reference-field', el, values, control?.getAttribute('aria-label') || valor);
    for (const k of el.children) if (k !== control) h.walk(k);
    return 'stop';
  }

  // ---- Seletor "Ligar a…" (o mesmo popup do RefPicker): título e faixa do rodapé são do desenho.
  if (el.matches('dialog.picker')) {
    const title = el.querySelector('.picker-head h2');
    h.push('marking-picker', el, { titulo: title ? h.textOf(title) : null, rodape: h.sn(Boolean(el.querySelector('.picker-foot'))) }, title ? h.textOf(title) : 'Seletor de marcação');
    return 'group';
  }
  if (el.matches('.picker-head h2')) return 'stop';
  if (el.matches('.picker-foot')) return 'group';
  // Dica do rodapé: as teclas (Caixa com a borda e Texto t-kbd) e a ação (Texto).
  if (el.matches('.picker-foot > span')) {
    for (const n of el.childNodes) {
      if (n.nodeType === 1 && n.matches('.kbd')) {
        h.push('box', n, { fundo: 'nenhum', borda: 'control', lados: 'todos', raio: 'xs', sombra: 'nenhuma' }, `Tecla ${h.textOf(n)}`);
        const t = [...n.childNodes].find((x) => x.nodeType === 3 && x.textContent.trim());
        if (t) textAt(n, t.textContent.trim(), textNodeRect(t));
      } else if (n.nodeType === 3 && n.textContent.trim()) textAt(el, n.textContent.trim(), textNodeRect(n));
    }
    return 'stop';
  }

  // ---- Painel "Mostrar no canvas" (modo visualização): o título é do desenho.
  if (el.matches('.view-panel-popover')) {
    const title = el.querySelector('.view-panel-title');
    h.push('view-mode-panel', el, { titulo: title ? h.textOf(title) : null }, 'Mostrar no canvas');
    return 'group';
  }
  if (el.matches('.view-panel-title')) return 'stop';

  // ---- Campo sem moldura (a célula da grade, o nome da anotação, o nome da camada editável): no app
  // o input não tem fundo nem borda até receber o foco, então o que se vê é o texto.
  if (el.matches('input.input') && transparent(cs.backgroundColor) && transparent(cs.borderTopColor)) {
    const placeholder = !el.value && el.placeholder;
    const s = placeholder ? getComputedStyle(el, '::placeholder') : cs;
    const texto = el.value || el.placeholder || '';
    if (!texto) return 'stop';
    const r = h.clip(content(el), el, true);
    if (r) h.push('text', el, { texto, estilo: h.textStyle(s.fontSize ? s : cs), cor: placeholder ? color(s.color) : color(cs.color), alinhamento: 'left', decoracao: 'none', quebra: 'não' }, texto, r);
    return 'stop';
  }

  // ---- Campo com moldura vazio e com placeholder (a busca do seletor): o TextField e o placeholder,
  // que se vê no app, como Texto muted por cima (o TextField só desenha o valor).
  if (el.matches('input.input') && !el.value && el.placeholder) {
    h.push('text-field', el, { rotulo: null, valor: '', size: el.classList.contains('input-sm') ? 'sm' : 'md', invalido: h.sn(el.classList.contains('input-invalid')), linhas: 'uma' }, el.getAttribute('aria-label') || el.placeholder);
    const s = getComputedStyle(el, '::placeholder');
    const r = h.clip(content(el), el, true);
    if (r) h.push('text', el, { texto: el.placeholder, estilo: h.textStyle(s.fontSize ? s : cs), cor: color(s.color), alinhamento: 'left', decoracao: 'none', quebra: 'não' }, el.placeholder, r);
    return 'stop';
  }

  // ---- Botão com cara de link ("+ Linha", "+ Par"): sem fundo nem borda, o que se vê é o texto em accent.
  if (el.matches('.button.button-link')) {
    const dt = h.directText(el);
    if (dt) textAt(el, dt.text, dt.rect, { cor: 'accent' });
    return 'stop';
  }

  // ---- Texto de uma linha cortado com reticências (text-overflow: ellipsis): a marcação tem a largura
  // do conteúdo da caixa, onde o app corta, e o Texto leva reticencias.
  if (el.children.length === 0 && !el.matches('input, select, textarea, button, .button, .icon-button') && cs.textOverflow === 'ellipsis' && cs.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 0.5) {
    const texto = h.textOf(el);
    if (!texto) return 'stop';
    const r = h.clip(content(el), el, true);
    // Cortado pela rolagem (a última opção do seletor): fica de fora, como o resto do que não aparece.
    if (r && r.height >= 0.9 * el.getBoundingClientRect().height) h.push('text', el, { texto, estilo: h.textStyle(cs), cor: color(cs.color), alinhamento: cs.textAlign === 'right' || cs.textAlign === 'end' ? 'right' : 'left', decoracao: 'none', quebra: 'não', reticencias: 'sim' }, texto, r);
    return 'stop';
  }
  return undefined;
}

export const rules = [detalhes];
