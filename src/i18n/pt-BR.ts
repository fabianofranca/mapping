export const ptBR = {
  'app.title': 'Mapeador de Imagens',
  'home.welcome': 'Bem-vindo',
  'home.empty':
    'Nenhum projeto aberto ainda. As opções de projeto chegam na próxima fase.',
  'settings.title': 'Configurações',
  'settings.language': 'Idioma',
  'settings.theme': 'Tema',
  'theme.system': 'Sistema',
  'theme.light': 'Claro',
  'theme.dark': 'Escuro',
  'language.pt-BR': 'Português (Brasil)',
  'language.en-US': 'English (US)',
} as const;

export type Dictionary = Record<keyof typeof ptBR, string>;
