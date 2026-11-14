import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Icon } from '../../src/ui/icons';
import {
  Button,
  Choice,
  IconButton,
  LinkButton,
  Segmented,
  Select,
  Tabs,
  TextArea,
  TextField,
  Tooltip,
} from '../../src/ui/controls';

afterEach(cleanup);

describe('Button', () => {
  it('is type="button" by default and carries the variant and the size in the classes', () => {
    render(
      <Button variant="danger" size="sm" class="extra">
        Delete
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.className).toBe('button button-danger button-sm extra');
  });

  it('disabled does not fire the click', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Ok
      </Button>,
    );
    await userEvent.setup().click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('IconButton', () => {
  it('icon only: the label is the accessible name and goes to the tooltip with the shortcut', () => {
    const { container } = render(
      <IconButton icon="undo" label="Undo" shortcut="Ctrl+Z" />,
    );
    const button = screen.getByRole('button', { name: 'Undo' });
    // Stage 8 (8.3), F5: the attribute in ARIA syntax; the human label stays in the tooltip.
    expect(button.getAttribute('aria-keyshortcuts')).toBe('Control+Z');
    expect(button.querySelector('svg')).not.toBeNull();
    const tip = container.querySelector('.tooltip');
    expect(tip?.textContent).toContain('Undo');
    expect(tip?.querySelector('kbd')?.textContent).toBe('Ctrl+Z');
    // The tooltip is decorative: it does not duplicate the name for screen readers.
    expect(tip?.getAttribute('aria-hidden')).toBe('true');
  });

  it('with visible text, the name comes from the text; the tooltip can have other text', () => {
    const { container } = render(
      <IconButton icon="list" label="Show list" text="List" tooltip="Another tip" />,
    );
    expect(screen.getByRole('button', { name: 'List' })).toBeTruthy();
    expect(container.querySelector('.tooltip')?.textContent).toBe('Another tip');
  });

  it('toggle uses aria-pressed', () => {
    render(<IconButton icon="text" label="Text" pressed />);
    expect(
      screen.getByRole('button', { name: 'Text' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('Esc dismisses the tooltip without taking the focus', async () => {
    const { container } = render(<IconButton icon="undo" label="Undo" />);
    const user = userEvent.setup();
    await user.tab();
    const anchor = container.querySelector('.tooltip-anchor');
    expect(anchor?.className).not.toContain('tooltip-dismissed');
    await user.keyboard('{Escape}');
    expect(anchor?.className).toContain('tooltip-dismissed');
    expect(document.activeElement).toBe(screen.getByRole('button'));
  });

  // Stage 6 (6.4), findings 2 and 6: the tooltip stays out of the flow (fixed position, computed
  // when it appears) and inside the browser window, without being cut by the panel edge.
  it('the tooltip positions itself on screen on hover, without leaving through the edge', () => {
    const { container } = render(<IconButton icon="undo" label="Show Class · Contact" />);
    const anchor = container.querySelector<HTMLElement>('.tooltip-anchor');
    const tip = container.querySelector<HTMLElement>('.tooltip');
    if (!anchor || !tip) throw new Error('no tooltip');
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 2, y: 100, width: 24, height: 24 }),
    );
    vi.spyOn(tip, 'offsetWidth', 'get').mockReturnValue(160);
    vi.spyOn(tip, 'offsetHeight', 'get').mockReturnValue(20);
    fireEvent.pointerEnter(anchor);
    // Centered on the button it would go to x = 14 − 80 < 0: it sticks to the window margin.
    expect(tip.style.left).toBe('8px');
    expect(tip.style.top).toBe('128px');
  });

  // #497 (AC1): on the side strip the tooltip comes out beside the button, not below, where it
  // covered the content of the open window.
  it('placement="end" puts the tooltip to the right of the control, vertically centered', () => {
    const { container } = render(
      <Tooltip label="Catalog" placement="end">
        <button type="button">x</button>
      </Tooltip>,
    );
    const anchor = container.querySelector<HTMLElement>('.tooltip-anchor');
    const tip = container.querySelector<HTMLElement>('.tooltip');
    if (!anchor || !tip) throw new Error('no tooltip');
    expect(anchor.className).toContain('tooltip-end');
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 2, y: 100, width: 36, height: 28 }),
    );
    vi.spyOn(tip, 'offsetWidth', 'get').mockReturnValue(80);
    vi.spyOn(tip, 'offsetHeight', 'get').mockReturnValue(20);
    fireEvent.pointerEnter(anchor);
    // Right of the button (2 + 36) plus the gap (4); vertical center 100 + 14 − 10.
    expect(tip.style.left).toBe('42px');
    expect(tip.style.top).toBe('104px');
  });

  it('placement="end" stays inside the window: with no room on the right, it goes to the left', () => {
    const { container } = render(
      <Tooltip label="Properties" placement="end">
        <button type="button">x</button>
      </Tooltip>,
    );
    const anchor = container.querySelector<HTMLElement>('.tooltip-anchor');
    const tip = container.querySelector<HTMLElement>('.tooltip');
    if (!anchor || !tip) throw new Error('no tooltip');
    const width = globalThis.innerWidth;
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: width - 38, y: 100, width: 36, height: 28 }),
    );
    vi.spyOn(tip, 'offsetWidth', 'get').mockReturnValue(120);
    vi.spyOn(tip, 'offsetHeight', 'get').mockReturnValue(20);
    fireEvent.pointerEnter(anchor);
    // It does not fit on the right: the tooltip comes out on the left of the button (x − 4 − 120).
    expect(tip.style.left).toBe(`${width - 38 - 4 - 120}px`);
    expect(tip.style.top).toBe('104px');
  });
});

describe('TextField', () => {
  it('with a label, the field stays inside the label', () => {
    render(<TextField label="Name" value="a" onInput={() => undefined} />);
    expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('a');
  });

  it('invalid marks the class and aria-invalid', () => {
    render(<TextField aria-label="x" value="" invalid onInput={() => undefined} />);
    const input = screen.getByLabelText('x');
    expect(input.className).toContain('input-invalid');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('with onCommit it only saves on confirming', async () => {
    const onCommit = vi.fn(() => true);
    render(<TextField aria-label="x" value="a" onCommit={onCommit} />);
    const user = userEvent.setup();
    const input = screen.getByLabelText('x');
    await user.clear(input);
    await user.type(input, 'b');
    expect(onCommit).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onCommit).toHaveBeenCalledWith('b');
  });

  it('inputRef gives access to the <input>', () => {
    const ref: { current: HTMLInputElement | null } = { current: null };
    render(
      <TextField aria-label="x" value="" inputRef={ref} onInput={() => undefined} />,
    );
    expect(ref.current).toBe(screen.getByLabelText('x'));
  });
});

describe('Select', () => {
  it('changes the option and hides the decorative arrow from screen readers', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <Select label="Theme" value="a" onChange={(e) => onChange(e.currentTarget.value)}>
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    );
    await userEvent.setup().selectOptions(screen.getByLabelText('Theme'), 'b');
    expect(onChange).toHaveBeenCalledWith('b');
    expect(container.querySelector('.select-chevron')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });
});

describe('Choice', () => {
  it('the label and the hint stay in the same label and clicking the text checks it', async () => {
    const onChange = vi.fn();
    render(
      <Choice
        label="Text"
        hint="hint"
        onChange={(e) => onChange(e.currentTarget.checked)}
      />,
    );
    const box = screen.getByLabelText<HTMLInputElement>(/Text/);
    expect(box.type).toBe('checkbox');
    await userEvent.setup().click(screen.getByText('Text'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('radio', () => {
    render(<Choice type="radio" name="g" label="One" />);
    expect(screen.getByRole('radio', { name: 'One' })).toBeTruthy();
  });
});

describe('Segmented', () => {
  const items = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B', disabled: true },
  ];

  it('marks the chosen one with aria-pressed and calls onSelect (including on the already chosen one)', async () => {
    const onSelect = vi.fn();
    render(<Segmented items={items} value="a" label="Group" onSelect={onSelect} />);
    expect(screen.getByRole('group', { name: 'Group' })).toBeTruthy();
    const a = screen.getByRole('button', { name: 'A' });
    expect(a.getAttribute('aria-pressed')).toBe('true');
    await userEvent.setup().click(a);
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('disabled item and disabled group do not respond', async () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <Segmented items={items} value={null} onSelect={onSelect} />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'B' }));
    expect(onSelect).not.toHaveBeenCalled();
    rerender(<Segmented items={items} value={null} disabled onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: 'A' }).hasAttribute('disabled')).toBe(true);
  });

  it('icon-only item has an accessible name and tooltip', () => {
    const { container } = render(
      <Segmented
        items={[{ id: 'a', label: 'Navigate', icon: 'pan' }]}
        value="a"
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Navigate' })).toBeTruthy();
    expect(container.querySelector('.tooltip')?.textContent).toBe('Navigate');
  });
});

describe('Tabs', () => {
  function Harness({ onChange }: { onChange?: (id: string) => void }) {
    const [value, setValue] = useState<'a' | 'b' | 'c'>('a');
    return (
      <Tabs
        label="Tabs"
        value={value}
        onChange={(id) => {
          setValue(id);
          onChange?.(id);
        }}
        tabs={[
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B', disabled: true },
          { id: 'c', label: 'C' },
        ]}
      />
    );
  }

  it('only the chosen tab enters the Tab order', () => {
    render(<Harness />);
    expect(screen.getByRole('tab', { name: 'A' }).getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('tab', { name: 'C' }).getAttribute('tabindex')).toBe('-1');
  });

  it('arrows, Home and End move the focus and the selection, skipping disabled tabs', () => {
    render(<Harness />);
    const a = screen.getByRole('tab', { name: 'A' });
    const c = screen.getByRole('tab', { name: 'C' });
    a.focus();
    fireEvent.keyDown(a, { key: 'ArrowRight' });
    expect(c.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(c);
    fireEvent.keyDown(c, { key: 'ArrowRight' });
    expect(a.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(a, { key: 'End' });
    expect(c.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(c, { key: 'Home' });
    expect(a.getAttribute('aria-selected')).toBe('true');
  });

  it('reacts to the list resizing and disconnects on cleanup', () => {
    let notify: () => void = () => undefined;
    const disconnect = vi.fn();
    class FakeObserver {
      constructor(cb: () => void) {
        notify = cb;
      }
      observe = vi.fn();
      disconnect = disconnect;
    }
    vi.stubGlobal('ResizeObserver', FakeObserver);
    const geometry: Array<[string, number]> = [
      ['offsetLeft', 300],
      ['offsetWidth', 80],
    ];
    const restore = geometry.map(([key]) =>
      Object.getOwnPropertyDescriptor(HTMLElement.prototype, key),
    );
    for (const [key, value] of geometry)
      Object.defineProperty(HTMLElement.prototype, key, {
        configurable: true,
        get(this: HTMLElement) {
          // Only the tabs have geometry; the list stays at 0.
          return this.getAttribute('role') === 'tab' ? value : 0;
        },
      });
    try {
      const { unmount } = render(<Harness />);
      const list = screen.getByRole('tablist');
      // Wide strip: the chosen tab (300 to 380) already fits, nothing scrolls.
      Object.defineProperty(list, 'clientWidth', { configurable: true, value: 500 });
      list.scrollLeft = 0;
      notify();
      expect(list.scrollLeft).toBe(0);
      // Window narrowed afterwards: the strip becomes 200 and the chosen tab comes back into view.
      Object.defineProperty(list, 'clientWidth', { configurable: true, value: 200 });
      notify();
      expect(list.scrollLeft).toBe(180);
      unmount();
      expect(disconnect).toHaveBeenCalled();
    } finally {
      geometry.forEach(([key], i) => {
        const d = restore[i];
        if (d) Object.defineProperty(HTMLElement.prototype, key, d);
      });
      vi.unstubAllGlobals();
    }
  });

  it('click switches the tab', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole('tab', { name: 'C' }));
    expect(onChange).toHaveBeenCalledWith('c');
  });
});

// Variants of the proposal review (HANDOFF-PROPOSALS 2.2).
describe('review variants', () => {
  it('Button accept/reject and ghost', () => {
    render(
      <>
        <Button variant="accept" aria-pressed={true}>
          Accept item
        </Button>
        <Button variant="reject">Reject item</Button>
        <Button variant="ghost">Leave</Button>
      </>,
    );
    const accept = screen.getByRole('button', { name: 'Accept item' });
    expect(accept.className).toBe('button button-accept');
    expect(accept.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Reject item' }).className).toBe(
      'button button-reject',
    );
    expect(screen.getByRole('button', { name: 'Leave' }).className).toBe(
      'button button-ghost',
    );
  });

  it('IconButton accept/reject compact and with a numeric badge', () => {
    render(
      <>
        <IconButton icon="check" variant="accept" size="sm" label="Accept" />
        <IconButton icon="proposal" label="Proposals" badge="2" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Accept' }).className).toBe(
      'icon-button icon-button-accept icon-button-sm',
    );
    const proposals = screen.getByRole('button', { name: 'Proposals' });
    expect(proposals.querySelector('.icon-button-badge')?.textContent).toBe('2');
  });

  it('Tabs with an informative counter', () => {
    render(
      <Tabs
        label="Windows"
        value="a"
        onChange={() => {}}
        tabs={[
          { id: 'a', label: 'List', badge: '3' },
          { id: 'b', label: 'Proposals', badge: '1', badgeTone: 'info' },
        ]}
      />,
    );
    expect(
      screen.getByRole('tab', { name: /^Proposals/ }).querySelector('.tab-badge-info'),
    ).toBeTruthy();
    expect(
      screen.getByRole('tab', { name: /^List/ }).querySelector('.tab-badge-info'),
    ).toBeNull();
  });

  it('TextArea: several lines, saves on leaving the field', () => {
    const onCommit = vi.fn();
    render(<TextArea aria-label="Note" value="" onCommit={onCommit} />);
    const area = screen.getByRole('textbox', { name: 'Note' });
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.className).toBe('input input-area');
    fireEvent.input(area, { target: { value: 'line 1\nline 2' } });
    fireEvent.blur(area);
    expect(onCommit).toHaveBeenCalledWith('line 1\nline 2');
  });
});

describe('LinkButton', () => {
  it('is an <a> with the button look, opens in another tab and carries the icon', () => {
    render(
      <LinkButton href="guia/index.html" class="extra">
        <Icon name="info" />
        Open guide
      </LinkButton>,
    );
    const link = screen.getByRole('link', { name: 'Open guide' });
    expect(link.tagName).toBe('A');
    expect(link.className).toBe('button extra');
    expect(link.getAttribute('href')).toBe('guia/index.html');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.querySelector('svg.icon')).not.toBeNull();
  });
});
