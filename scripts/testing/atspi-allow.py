#!/usr/bin/env python3.12
"""Clica em "Permitir"/"Permitir em todas as visitas" no pedido de permissão do Chrome
(docs/TESTING.md, apêndice A, receita 6 da nuvem), pelo AT-SPI.

Uso: /usr/bin/python3.12 scripts/testing/atspi-allow.py

Use sempre /usr/bin/python3.12: o `python3` do PATH quebra o `gi` neste ambiente.

Saída e código de saída:
  - "clicou <botão> <ação>", 0: achou e acionou o botão.
  - "nenhum botão de permitir", 1: nenhum botão achado (o navegador já tinha a permissão;
    tão sucesso quanto clicar, na prática, mas o código de saída continua 1).
  - "sem ação <lista>", 2: achou o botão, mas nenhuma ação conhecida nele (erro real).
"""
import sys

import gi

gi.require_version('Atspi', '2.0')
from gi.repository import Atspi  # noqa: E402

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
            print('sem ação', action_names)
            sys.exit(2)
        action_iface.do_action(index)
        print('clicou', wanted, action_names[index])
        sys.exit(0)
    print('nenhum botão de permitir')
    sys.exit(1)


if __name__ == '__main__':
    main()
