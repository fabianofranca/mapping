// Mede o app real (dist/index.html) e converte cada elemento visível num item da biblioteca Mapping DS.
// Saída: extracted.json (containers com itens) e capturas real-*.png para comparar.
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const SCRATCH = 'C:/Pessoal/mapping/workspace/ferramentas/mapping-ds';
// SRC=<pasta do build>: o app medido (o layout do projeto é o do mcp-v0.25.0, em app25).
const SRC = process.env.SRC ?? `${SCRATCH}/app`;
// O projeto aberto no app real é a fixture (o comentarios antes da v5; gerada por fixture.mjs), não o projeto vivo.
const PROJECT = `${SCRATCH}/shots/fixture`;
const require = createRequire(`${SRC}/package.json`);
const { chromium } = require('@playwright/test');
const JSZip = require('jszip');
const lib = await import(pathToFileURL(`${SCRATCH}/lib.mjs`).href);

const C = lib.TOKEN_COLORS;
const ICON_BY_STROKE = lib.ICON_BY_RAW;
const COR = { text: C.text, muted: C.muted, accent: C.accent, danger: C.danger, warning: C.warning, success: C.success, 'accent-text': C.accentText };
const FUNDO = { surface: C.surface, bg: C.bg, canvas: '#e4e7eb', hover: '#eef1f4', pressed: '#e3e7ec', selection: C.selection, 'selection-muted': C.selectionMuted, 'warning-bg': C.warningBg, 'danger-bg': C.dangerBg, 'success-bg': C.successBg, accent: C.accent, tooltip: C.tooltip };
const BORDA = { border: C.border, control: C.control, accent: C.accent, danger: C.danger, warning: C.warning };

// ---- Dados de teste: conversas reais no formato mapping-thread.
const SALVAR = '20875dee-b57b-4a34-b1bb-cd3f79305e32';
const EMAIL = '4411a58f-0a5c-4e0d-9421-77a8c3826037';
const SALVAR_ANN = '5833b618-5458-4396-b042-a590643d99af';
const AGENT = { kind: 'agent', name: 'Claude Code', email: null };
const MARINA = { kind: 'human', name: 'Marina Alves', email: 'marina@exemplo.com' };
const JOAO = { kind: 'human', name: 'João Lima', email: 'joao@exemplo.com' };
const msg = (id, author, at, text, proposal = null) => ({ id, author, at, text, proposal });
const thread = (id, anchor, messages, resolved = null) => ({
  format: 'mapping-thread',
  formatVersion: 1,
  id,
  anchor,
  createdAt: messages[0].at,
  revision: 1,
  resolved,
  messages,
});
const THREADS = {
  'comments/5d0e8a41-2c7b-4f1e-9a63-b8c1d4e7f902.json': thread('5d0e8a41-2c7b-4f1e-9a63-b8c1d4e7f902', { kind: 'marking', id: SALVAR }, [
    msg('0b6f31c2-5e8a-4d97-a1c4-72e9d03b8f15', AGENT, '2026-11-07T09:14:03.000Z', 'A especialização não diz qual **variante** usar no [Campo E-mail](mapping://comentarios/m/4411a58f). Qual vale?'),
    msg('e4a98d27-1b63-4f05-8c7a-3d5e0f2a6b91', MARINA, '2026-11-07T09:41:20.000Z', 'É outlined, como o [Botão antigo](mapping://comentarios/m/deadbeef).'),
    msg('a2c5d718-9f04-4b3e-86d1-0e7b4a93c5f6', AGENT, '2026-11-07T10:02:47.000Z', 'Proposta: Variantes dos botões', '6b2c17b8-d3c1-413e-8427-a1ea79d6be21'),
  ]),
  'comments/c3a96f10-8e24-47bd-b5d0-1f7a2e9c6b38.json': thread('c3a96f10-8e24-47bd-b5d0-1f7a2e9c6b38', { kind: 'field', annotationId: SALVAR_ANN, key: 'variant' }, [
    msg('1d2e3f40-5a6b-4c7d-8e9f-a0b1c2d3e4f5', JOAO, '2026-11-07T10:20:00.000Z', 'O rótulo deve ser Salvar alterações?'),
  ]),
  'comments/resolved/91b7e2d5-0a4c-4c68-8f3e-6d2b5a1c9e70.json': thread(
    '91b7e2d5-0a4c-4c68-8f3e-6d2b5a1c9e70',
    { kind: 'marking', id: EMAIL },
    [
      msg('2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d', MARINA, '2026-11-05T14:00:00.000Z', 'O campo aceita só e-mail corporativo?'),
      msg('3b4c5d6e-7f8a-4b9c-8d0e-1f2a3b4c5d6e', AGENT, '2026-11-05T14:05:00.000Z', 'Sim, a validação está no TextField.'),
    ],
    { by: { name: 'Marina Alves', email: 'marina@exemplo.com' }, at: '2026-11-05T15:00:00.000Z' },
  ),
  'comments/7e8f9a0b-1c2d-4e3f-8a4b-5c6d7e8f9a0b.json': thread('7e8f9a0b-1c2d-4e3f-8a4b-5c6d7e8f9a0b', { kind: 'marking', id: 'ffffffff-0000-4000-8000-000000000000' }, [
    msg('4c5d6e7f-8a9b-4c0d-9e1f-2a3b4c5d6e7f', JOAO, '2026-11-04T11:00:00.000Z', 'Pode apagar esta tela?'),
  ]),
};

function walkFs(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walkFs(full) : [full];
  });
}
async function projectZip() {
  const zip = new JSZip();
  for (const full of walkFs(PROJECT)) {
    const rel = relative(PROJECT, full).split('\\').join('/');
    if (rel === '.gitignore' || rel.startsWith('comments/')) continue;
    zip.file(rel, readFileSync(full));
  }
  for (const [path, data] of Object.entries(THREADS)) zip.file(path, JSON.stringify(data, null, 2) + '\n');
  return zip.generateAsync({ type: 'nodebuffer' });
}

// ---- O extrator, rodando dentro da página.
function extract({ rootSel, icons, cor, fundo, borda }) {
  const all = document.querySelectorAll(rootSel);
  const root = all[all.length - 1];
  const O = root.getBoundingClientRect();
  const items = [];
  const rgb = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return null;
    const p = m[1].split(',').map((s) => parseFloat(s));
    if (p.length === 4 && p[3] < 0.05) return null;
    return p;
  };
  const near = (c, table) => {
    const v = rgb(c);
    if (!v) return null;
    let best = null;
    let bd = Infinity;
    for (const [k, h] of Object.entries(table)) {
      const r = parseInt(h.slice(1, 3), 16);
      const g = parseInt(h.slice(3, 5), 16);
      const b = parseInt(h.slice(5, 7), 16);
      const d = (r - v[0]) ** 2 + (g - v[1]) ** 2 + (b - v[2]) ** 2;
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  };
  const clip = (r0, el, self = false) => {
    let x1 = r0.left;
    let y1 = r0.top;
    let x2 = r0.right;
    let y2 = r0.bottom;
    // O próprio dialog[open] também encerra a subida: no DOM ele pode estar dentro de uma janela com
    // overflow (o "Apagar a conversa" fica na janela Comentários), mas é desenhado na camada de cima.
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      if (p === el && !self) {
        if (p.matches('dialog[open]')) break;
        continue;
      }
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const q = p.getBoundingClientRect();
        x1 = Math.max(x1, q.left);
        y1 = Math.max(y1, q.top);
        x2 = Math.min(x2, q.right);
        y2 = Math.min(y2, q.bottom);
      }
      if (p.matches("dialog[open]")) break;
    }
    x1 = Math.max(x1, O.left);
    y1 = Math.max(y1, O.top);
    x2 = Math.min(x2, O.right);
    y2 = Math.min(y2, O.bottom);
    if (x2 - x1 < 2 || y2 - y1 < 2) return null;
    return { x: Math.round(x1 - O.left), y: Math.round(y1 - O.top), width: Math.round(x2 - x1), height: Math.round(y2 - y1) };
  };
  const shown = (el) => {
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
      if (p.matches('dialog[open]')) break;
    }
    const r = el.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1;
  };
  const iconOf = (svg) => {
    if (!svg) return null;
    const d = [...svg.querySelectorAll('path')].map((p) => p.getAttribute('d') || '').join('');
    return icons[d] ?? null;
  };
  const textOf = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const sn = (b) => (b ? 'sim' : 'não');
  const push = (type, el, values, name, rect) => {
    const full = el.getBoundingClientRect();
    const r = rect ?? clip(full, el);
    if (!r) return false;
    if (!rect && r.width * r.height < 0.9 * full.width * full.height) return false;
    items.push({ type, name: (name || type).slice(0, 80), rect: r, values: values ?? {} });
    return true;
  };
  const textStyle = (cs) => {
    const size = parseFloat(cs.fontSize);
    const w = parseInt(cs.fontWeight, 10);
    if (/monospace|Consolas|Mono/i.test(cs.fontFamily)) return 't-code';
    if (size >= 19) return 't-display';
    if (size >= 14.5) return 't-title';
    if (size >= 12.5) return w >= 600 ? 't-body-strong' : 't-body';
    if (size >= 11.5) return 't-small';
    return w >= 600 ? 't-micro' : 't-kbd';
  };
  const effBg = (el) => {
    for (let p = el; p; p = p.parentElement) {
      const c = rgb(getComputedStyle(p).backgroundColor);
      if (c) return getComputedStyle(p).backgroundColor;
    }
    return 'rgb(255,255,255)';
  };
  const RAIOS = [['0', 0], ['xs', 2], ['sm', 4], ['md', 6], ['lg', 8], ['xl', 12]];
  const boxOf = (el, cs) => {
    const bg = rgb(cs.backgroundColor) ? cs.backgroundColor : null;
    const parentBg = el.parentElement ? effBg(el.parentElement) : null;
    const fundoName = bg && bg !== parentBg ? near(bg, fundo) : null;
    const sides = [];
    for (const [side, nome] of [['Top', 'cima'], ['Bottom', 'baixo'], ['Left', 'esquerda'], ['Right', 'direita']]) {
      if (parseFloat(cs[`border${side}Width`]) >= 1 && cs[`border${side}Style`] !== 'none' && rgb(cs[`border${side}Color`])) sides.push([nome, cs[`border${side}Color`]]);
    }
    const shadow = cs.boxShadow && cs.boxShadow !== 'none';
    if (!fundoName && sides.length === 0 && !shadow) return null;
    const r = el.getBoundingClientRect();
    const rad = parseFloat(cs.borderTopLeftRadius) || 0;
    const raio = rad >= Math.min(r.width, r.height) / 2 - 0.5 && rad > 0 ? 'full' : RAIOS.reduce((a, b) => (Math.abs(b[1] - rad) < Math.abs(a[1] - rad) ? b : a))[0];
    return {
      fundo: fundoName ?? 'nenhum',
      borda: sides.length ? near(sides[0][1], borda) : 'nenhuma',
      lados: sides.length === 0 ? 'todos' : sides.length >= 3 ? 'todos' : sides[0][0],
      raio,
      sombra: shadow ? 'popup' : 'nenhuma',
    };
  };
  const nameOf = (el) => (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : el.tagName.toLowerCase());
  const directText = (el) => {
    const nodes = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (!nodes.length) return null;
    const range = document.createRange();
    range.setStartBefore(nodes[0]);
    range.setEndAfter(nodes[nodes.length - 1]);
    return { text: nodes.map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim(), rect: range.getBoundingClientRect() };
  };

  const walk = (el) => {
    if (!(el instanceof Element) || !shown(el)) return;
    if (el.matches('.tooltip, .visually-hidden, .canvas-host, canvas, .tool-resizer, script, style, option, .tool-window-title, .dialog-header, .icon-button-text')) return;
    const cs = getComputedStyle(el);

    // Atômicos: o item inteiro é uma marcação.
    if (el.matches('.icon-button')) {
      const icone = iconOf(el.querySelector('svg')) ?? 'marking';
      const label = el.getAttribute('aria-label') || el.getAttribute('title') || textOf(el) || icone;
      if (el.closest('.tool-strip')) {
        push('tool-strip-button', el, { icone, selecionado: sn(el.getAttribute('aria-pressed') === 'true') }, label);
        return;
      }
      const textEl = el.querySelector('.icon-button-text');
      const visibleText = textEl && textEl.getBoundingClientRect().width > 2 ? textOf(textEl) : '';
      const variant = ['danger', 'accept', 'reject'].find((v) => el.classList.contains(`icon-button-${v}`)) ?? 'default';
      const badge = el.querySelector('.icon-button-badge');
      push('icon-button', el, {
        icone,
        rotulo: label,
        texto: visibleText || null,
        variant,
        size: el.classList.contains('icon-button-sm') ? 'sm' : 'md',
        pressionado: sn(el.getAttribute('aria-pressed') === 'true'),
        alerta: sn(Boolean(el.querySelector('.icon-button-alert'))),
        selo: badge ? textOf(badge) : null,
      }, label);
      return;
    }
    if (el.matches('.menu-trigger')) {
      // Gatilho do menu do projeto: o nome em t-title e a seta.
      const t = directText(el.querySelector('.menu-trigger-text') ?? el);
      const span = el.querySelector('.menu-trigger-text');
      if (span) push('text', span, { texto: textOf(span), estilo: 't-title', cor: 'text' }, textOf(span));
      const svg = el.querySelector('svg');
      if (svg) push('icon', svg, { icone: iconOf(svg) ?? 'chevronDown', cor: 'text' }, 'seta do menu');
      void t;
      return;
    }
    if (el.matches('.button')) {
      const variant = ['primary', 'danger', 'accept', 'reject', 'ghost'].find((v) => el.classList.contains(`button-${v}`)) ?? 'default';
      const inMenu = Boolean(el.closest('.menu-items, .menu-list, .action-menu-list'));
      push('button', el, {
        texto: textOf(el),
        variant: inMenu && variant === 'default' ? 'ghost' : variant,
        size: el.classList.contains('button-sm') ? 'sm' : 'md',
        desabilitado: sn(el.disabled),
        alinhamento: inMenu ? 'start' : 'center',
      }, textOf(el));
      return;
    }
    if (el.matches('.segmented')) {
      const opcoes = [...el.querySelectorAll('.segmented-item')].map((b) => {
        const txt = textOf(b);
        const icone = iconOf(b.querySelector('svg'));
        return { rotulo: txt || b.getAttribute('aria-label') || icone || '', selecionada: sn(b.getAttribute('aria-pressed') === 'true'), icone: txt ? null : icone };
      });
      push('segmented', el, { rotulo: el.getAttribute('aria-label') || 'Opções', desabilitado: 'não', invalido: 'não' }, el.getAttribute('aria-label') || 'Segmented');
      [...el.querySelectorAll('.segmented-item')].forEach((item, k) => push('segmented-item', item, opcoes[k], opcoes[k].rotulo));
      return;
    }
    if (el.matches('.select')) {
      const s = el.querySelector('select');
      push('select', el, { rotulo: null, valor: s?.selectedOptions[0]?.text ?? '', size: s?.classList.contains('input-sm') ? 'sm' : 'md', invalido: sn(s?.classList.contains('input-invalid')) }, s?.getAttribute('aria-label') || 'Select');
      return;
    }
    if (el.matches('input.input, textarea.input, .citation-editor')) {
      const area = el.tagName === 'TEXTAREA' || el.matches('.citation-editor');
      const valor = el.value ?? textOf(el);
      push('text-field', el, { rotulo: null, valor: valor || '', size: el.classList.contains('input-sm') ? 'sm' : 'md', invalido: sn(el.classList.contains('input-invalid')), linhas: area ? 'varias' : 'uma' }, el.getAttribute('aria-label') || el.getAttribute('placeholder') || 'Campo');
      return;
    }
    if (el.matches('label.choice')) {
      const input = el.querySelector('input');
      const hint = el.querySelector('.choice-hint');
      const label = textOf(el.querySelector('.choice-label') ?? el).replace(hint ? textOf(hint) : '', '').trim();
      push('choice', el, { tipo: input?.type === 'radio' ? 'radio' : 'checkbox', rotulo: label, dica: hint ? textOf(hint) : null, marcado: sn(input?.checked) }, label);
      return;
    }
    if (el.matches('.chip')) {
      const count = el.querySelector('.chip-count');
      push('tags', el, { texto: textOf(el).replace(count ? textOf(count) : '', '').trim(), pressionado: sn(el.getAttribute('aria-pressed') === 'true'), contagem: count ? Number(textOf(count)) : null }, textOf(el));
      return;
    }
    if (el.matches('.tabs')) {
      push('tabs', el, { rotulo: el.getAttribute('aria-label') || 'Abas' }, el.getAttribute('aria-label') || 'Abas');
      const small = Boolean(el.closest('.tool-window-bottom'));
      for (const tab of el.querySelectorAll('.tab')) {
        if (!shown(tab)) continue;
        const badge = tab.querySelector('.tab-badge');
        const text = textOf(tab).replace(badge ? textOf(badge) : '', '').trim();
        const icone = text ? null : iconOf(tab.querySelector('svg'));
        const label = text || tab.getAttribute('aria-label') || tab.getAttribute('title') || icone || 'Aba';
        push('tab', tab, { rotulo: label, selecionada: sn(tab.getAttribute('aria-selected') === 'true'), selo: badge ? textOf(badge) : null, tamanho: small ? 'sm' : 'md', icone }, label);
      }
      return;
    }
    if (el.matches('.citation-chip')) {
      push('citation-chip', el, { rotulo: textOf(el), quebrada: sn(el.classList.contains('citation-chip-broken')) }, textOf(el));
      return;
    }
    if (el.matches('.thread-avatar, .comments-avatar')) {
      push('avatar', el, { iniciais: textOf(el), estilo: el.matches('.comments-avatar') ? 'tabela' : 'conversa' }, textOf(el));
      return;
    }
    if (el.matches('.tag, .thread-message-agent, .thread-state, .comments-badge, .badge, .tab-badge')) {
      const c = el.classList;
      const estilo = c.contains('thread-message-agent')
        ? 'agente'
        : c.contains('thread-state-agent')
          ? 'estado-agente'
          : c.contains('thread-state-human')
            ? 'estado-humano'
            : c.contains('thread-state-resolved')
              ? 'estado-resolvida'
              : c.contains('comments-badge-agent')
                ? 'status-agente'
                : c.contains('comments-badge-resolved')
                  ? 'status-resolvida'
                  : c.contains('comments-badge')
                    ? 'status'
                    : c.contains('tab-badge')
                      ? c.contains('tab-badge-info') ? 'contagem-info' : 'contagem'
                      : c.contains('badge')
                        ? 'preview'
                        : 'tag';
      push('badge', el, { texto: textOf(el), estilo }, textOf(el));
      return;
    }
    if (el.matches('.notice-box')) {
      const tone = ['info', 'warning', 'error', 'success'].find((t) => el.classList.contains(`notice-box-${t}`)) ?? 'info';
      const title = el.querySelector('.notice-box-title');
      const body = el.querySelector('.notice-box-text, .notice-box-body');
      push('notice', el, { tom: tone, tamanho: el.classList.contains('notice-box-sm') ? 'sm' : 'md', titulo: title ? textOf(title) : null, texto: (body ? textOf(body) : textOf(el)).replace(title ? textOf(title) : '', '').trim() }, 'Aviso');
      return;
    }
    if (el.matches('svg')) {
      const icone = iconOf(el);
      if (icone) push('icon', el, { icone, cor: near(cs.color, cor) ?? 'text' }, icone);
      return;
    }

    // Grupos e molduras: a marcação e, depois, os filhos.
    let group = null;
    if (el.matches('.tool-window')) {
      const posicao = el.classList.contains('tool-window-left') ? 'left' : el.classList.contains('tool-window-bottom') ? 'bottom' : 'right';
      const title = el.querySelector('.tool-window-title');
      group = ['tool-window', { janela: el.getAttribute('data-window'), titulo: title ? textOf(title) : null, posicao }, `Janela ${title ? textOf(title) : el.getAttribute('data-window')}`];
    } else if (el.matches('.statusbar')) group = ['status-bar', {}, 'Barra de status'];
    else if (el.matches('.canvas-area')) group = ['canvas-marking', { nome: null, fundo: 'canvas' }, 'Área do canvas'];
    else if (el.matches('.crumbs')) group = ['breadcrumbs', {}, 'Caminho da seleção'];
    else if (el.matches('.thread-message')) group = ['thread-message', {}, `Mensagem de ${textOf(el.querySelector('.thread-message-author') ?? el).slice(0, 30)}`];
    else if (el.matches('.thread-composer')) group = ['composer', {}, 'Compositor'];
    else if (el.matches('.proposal-card')) group = ['proposal-card', {}, 'Cartão da proposta'];
    else if (el.matches('.dialog-body') && /^Apagar/.test(textOf(el.closest('.dialog')?.querySelector('.dialog-title') ?? document.createElement('i')))) group = ['delete-thread-dialogs', {}, 'Conteúdo do diálogo'];
    else if (el.matches('.dialog')) {
      const title = textOf(el.querySelector('.dialog-title') ?? el);
      group = [title === 'Configurações' ? 'settings-dialog' : 'dialog', title === 'Configurações' ? { titulo: title } : { titulo: title, size: el.classList.contains('dialog-lg') ? 'lg' : el.classList.contains('dialog-md') ? 'md' : 'sm', alerta: sn(el.getAttribute('role') === 'alertdialog') }, title];
    } else if (el.matches('.details-section') && /^Conversas/.test(textOf(el.querySelector('.details-section-head') ?? el))) group = ['threads-section', {}, 'Seção Conversas'];
    else if (el.parentElement?.matches('.tool-window[data-window=comments] .tool-window-body')) group = ['comments-window', {}, 'Conversas do mapeamento'];
    else if (/^Identidade/.test(textOf(el.querySelector(':scope > .repos-title, :scope > h2, :scope > h3') ?? document.createElement('i')))) group = ['identity-settings', {}, 'Seção Identidade'];
    if (group) {
      push(group[0], el, group[1], group[2]);
      if (el.matches('.canvas-area')) {
        for (const c of el.querySelectorAll(':scope > .minimap, :scope > .canvas-notices')) walk(c);
        return;
      }
    } else {
      const box = boxOf(el, cs);
      if (box) push('box', el, box, `Caixa ${nameOf(el)}`);
    }

    // Parágrafo com texto rico.
    const inlineKids = [...el.children].filter((c) => shown(c));
    const isParagraph =
      directText(el) &&
      inlineKids.length > 0 &&
      inlineKids.every((c) => /^inline/.test(getComputedStyle(c).display) && !c.matches('svg, .icon-button, .button, input, select, textarea'));
    const dt = isParagraph ? (() => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const space = ctx.measureText('\u00a0').width || 3.5;
      let text = '';
      for (const n of el.childNodes) {
        if (n.nodeType === 3) text += n.textContent;
        // O lugar do chip: espa\u00e7os n\u00e3o separ\u00e1veis, precedidos de um word joiner (U+2060), porque o Konva apaga os
        // espa\u00e7os (inclusive U+00A0) do come\u00e7o da linha quebrada e o texto depois do chip ia parar debaixo dele.
        else if (n.nodeType === 1 && n.matches('.citation-chip')) text += '\u2060' + '\u00a0'.repeat(Math.max(1, Math.round(n.getBoundingClientRect().width / space)));
        else if (n.nodeType === 1) text += n.innerText ?? n.textContent;
      }
      return { text: text.replace(/[ \t\n]+/g, ' ').trim(), rect: range.getBoundingClientRect() };
    })() : directText(el);
    if (dt) {
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
      const quebra = dt.rect.height > lh * 1.5 ? 'sim' : 'não';
      // Texto: arredonda para fora (o Konva quebra a última palavra se a caixa ficar 0,4 px mais estreita) e,
      // no parágrafo, a largura é a da caixa onde o DOM quebra as linhas, não a da linha mais longa.
      let tr = dt.rect;
      if (quebra === 'sim') {
        let b = el;
        while (b.parentElement && /^inline/.test(getComputedStyle(b).display)) b = b.parentElement;
        const bs = getComputedStyle(b);
        const br = b.getBoundingClientRect();
        const left = Math.min(tr.left, br.left + parseFloat(bs.borderLeftWidth) + parseFloat(bs.paddingLeft));
        const right = Math.max(tr.right, br.right - parseFloat(bs.borderRightWidth) - parseFloat(bs.paddingRight));
        tr = new DOMRect(left, tr.top, right - left, tr.height);
      }
      const out = new DOMRect(Math.floor(tr.left), tr.top, Math.ceil(tr.right) - Math.floor(tr.left), tr.height);
      const r = clip(out, el, true);
      if (r && r.height >= 0.6 * dt.rect.height) {
        const deco = /line-through/.test(cs.textDecorationLine) ? 'line-through' : /underline/.test(cs.textDecorationLine) ? 'underline' : 'none';
        const lines = Math.max(1, Math.round(dt.rect.height / lh));
        // Reticências: o ancestral com text-overflow: ellipsis e a largura do conteúdo dele (fracionária),
        // contra a largura do texto. tw e cw ficam no item para conferir o critério.
        let ell = null;
        for (let a = el; a && a !== document.body && !ell; a = a.parentElement) {
          const s = getComputedStyle(a);
          if (s.textOverflow === 'ellipsis' && s.overflowX !== 'visible') {
            const ar = a.getBoundingClientRect();
            ell = { cw: ar.width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - parseFloat(s.borderLeftWidth) - parseFloat(s.borderRightWidth), sw: a.scrollWidth, ci: a.clientWidth };
          }
        }
        items.push({
          type: 'text',
          name: dt.text.slice(0, 60),
          rect: r,
          lines,
          ...(ell ? { tw: dt.rect.width, ...ell } : {}),
          values: { texto: dt.text, estilo: textStyle(cs), cor: near(cs.color, cor) ?? 'text', alinhamento: cs.textAlign === 'right' || cs.textAlign === 'end' ? 'right' : cs.textAlign === 'center' ? 'center' : 'left', decoracao: deco, quebra },
        });
      }
    }
    if (isParagraph) {
      for (const c of el.querySelectorAll('.citation-chip')) walk(c);
      return;
    }
    for (const c of el.children) walk(c);
  };
  if (root.matches(".dialog")) walk(root);
  else for (const c of root.children) walk(c);
  return { width: Math.round(O.width), height: Math.round(O.height), items };
}

const args = { icons: ICON_BY_STROKE, cor: COR, fundo: FUNDO, borda: BORDA };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
await page.clock.setFixedTime(new Date('2026-11-07T13:30:00.000Z'));
await page.addInitScript(() => localStorage.setItem('mapping.identity', JSON.stringify({ name: 'Marina Alves', email: 'marina@exemplo.com' })));
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(pathToFileURL(`${SRC}/dist/index.html`).href);
await page.locator('input[type=file][accept*=".zip"]').first().setInputFiles({ name: 'comentarios.zip', mimeType: 'application/zip', buffer: await projectZip() });
await page.getByRole('main', { name: 'Canvas do projeto' }).waitFor({ timeout: 20000 });
await page.waitForTimeout(800);
await page.keyboard.press('Control+Shift+0');
await page.locator('.tool-window[data-window=comments]').waitFor();
await page.locator('.comments-row').first().waitFor();
// Abre a conversa do botão Salvar (seleciona o item e leva aos Detalhes).
await page.locator('.comments-row', { hasText: 'Salvar' }).first().click();
await page.locator('.thread-row', { hasText: 'especialização' }).first().click();
await page.locator('.thread-message').first().waitFor({ timeout: 10000 });
await page.locator('.details-section', { hasText: 'Conversas' }).last().evaluate((el) => el.scrollIntoView({ block: 'start' }));
await page.mouse.move(700, 600);
await page.waitForTimeout(600);
await page.screenshot({ path: `${SCRATCH}/shots/real-editor.png` });
const out = { containers: [] };
out.containers.push({ name: 'Editor — 1440 × 900', background: '#ffffff', ...(await page.evaluate(extract, { ...args, rootSel: '.editor-desktop' })) });

const dialog = async (name, open) => {
  try {
    await open();
    await page.locator('.dialog[open]').last().waitFor({ timeout: 5000 });
  } catch (e) {
    await page.screenshot({ path: `${SCRATCH}/shots/fail-${name.replace(/\W+/g, '_')}.png` });
    console.log('falhou:', name, String(e).split('\n')[0]);
    await page.keyboard.press('Escape');
    return;
  }
  const d = page.locator('.dialog[open]').last();
  await page.mouse.move(2, 2);
  await page.waitForTimeout(400);
  await d.screenshot({ path: `${SCRATCH}/shots/real-${name}.png` });
  out.containers.push({ name, background: '#ffffff', ...(await page.evaluate(extract, { ...args, rootSel: '.dialog[open]' })) });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
};
await dialog('Configurações › Identidade', async () => {
  await page.getByRole('button', { name: 'Configurações' }).first().click();
  await page.locator('.dialog[open]').waitFor();
  await page.locator('.dialog[open]').getByText('Identidade', { exact: true }).first().evaluate((h) => h.parentElement.scrollIntoView({ block: 'start' }));
});
await dialog('Apagar a conversa', async () => {
  await page.locator('.comments-row', { hasText: 'Salvar' }).first().getByRole('button', { name: /Ações da conversa/ }).click();
  await page.getByRole('menuitem', { name: 'Apagar', exact: true }).first().click();
});
await dialog('Apagar conversas em lote', async () => {
  await page.getByRole('button', { name: 'Ações da janela Comentários' }).click();
  await page.getByRole('menuitem', { name: /Apagar conversas/ }).first().click();
});
writeFileSync(`${SCRATCH}/shots/extracted.json`, JSON.stringify(out, null, 1));
for (const c of out.containers) console.log(c.name, c.width, 'x', c.height, '→', c.items.length, 'itens');
const byType = {};
for (const c of out.containers) for (const i of c.items) byType[i.type] = (byType[i.type] ?? 0) + 1;
console.log(JSON.stringify(byType));
if (errors.length) console.log('erros:', errors.join('\n'));
await browser.close();
