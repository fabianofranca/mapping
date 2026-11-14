#!/usr/bin/env python3.12
"""Clicks "Allow"/"Allow on every visit" in Chrome's permission prompt
(docs/TESTING.md, appendix A, cloud recipe 6), through AT-SPI.

Usage: /usr/bin/python3.12 scripts/testing/atspi-allow.py

Always use /usr/bin/python3.12: the `python3` on the PATH breaks `gi` in this environment.

Output and exit code:
  - "clicked <button> <action>", 0: found and triggered the button.
  - "no allow button", 1: no button found (the browser already had the permission;
    as good as clicking, in practice, but the exit code is still 1).
  - "no action <list>", 2: found the button, but no known action on it (a real error).
"""
import sys

import gi

gi.require_version('Atspi', '2.0')
from gi.repository import Atspi  # noqa: E402

# Chrome's own button labels, in the browser's pt-BR and en-US locales.
NAMES = ['Permitir em todas as visitas', 'Permitir', 'Allow on every visit', 'Allow']


def walk(node, found, depth=0):
    if node is None or depth > 60:
        return
    try:
        if node.get_role_name() == 'push button':
            found.append(node)
        for i in range(node.get_child_count()):
            walk(node.get_child_at_index(i), found, depth + 1)
    except Exception:
        pass


def main():
    found = []
    desktop = Atspi.get_desktop(0)
    for i in range(desktop.get_child_count()):
        app = desktop.get_child_at_index(i)
        if app and 'hrom' in (app.get_name() or ''):
            walk(app, found)
    by_name = {b.get_name(): b for b in found}
    for wanted in NAMES:
        button = by_name.get(wanted)
        if not button:
            continue
        action_iface = button.get_action_iface()
        action_names = [action_iface.get_action_name(k) for k in range(action_iface.get_n_actions())]
        index = next(
            (k for k, name in enumerate(action_names) if name in ('press', 'click', 'doDefault', 'activate')),
            None,
        )
        if index is None:
            print('no action', action_names)
            sys.exit(2)
        action_iface.do_action(index)
        print('clicked', wanted, action_names[index])
        sys.exit(0)
    print('no allow button')
    sys.exit(1)


if __name__ == '__main__':
    main()
