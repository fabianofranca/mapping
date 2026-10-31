import { readSetting, writeSetting } from '../utils/safeStorage';

// Consentimento de imagens remotas (PLAN.md, etapa Imagens remotas, decisões 3, 5 e 15 a 17).
// Vale por navegador: fica só no `localStorage`, com a origem normalizada (esquema incluído) como
// chave. Nunca vai para o projeto, a especialização, o zip nem o pacote da proposta; por isso um
// `id` de especialização reaproveitado não herda permissão.

export const IMAGE_ORIGINS_KEY = 'mapping.imageOrigins';
export const IMAGE_ALLOW_ANY_KEY = 'mapping.imageAllowAnyOrigin';
export const IMAGE_ALLOW_HTTP_KEY = 'mapping.imageAllowHttp';
export const IMAGE_ALLOW_LOCAL_KEY = 'mapping.imageAllowLocalNetwork';
export const IMAGE_ALLOW_NO_CORS_KEY = 'mapping.imageAllowNoCors';

export interface ImageSwitches {
  readonly allowAnyOrigin: boolean;
  readonly allowHttp: boolean;
  readonly allowLocalNetwork: boolean;
  readonly allowNoCors: boolean;
}

export type ImageSwitchName = keyof ImageSwitches;

const SWITCH_KEYS: Readonly<Record<ImageSwitchName, string>> = {
  allowAnyOrigin: IMAGE_ALLOW_ANY_KEY,
  allowHttp: IMAGE_ALLOW_HTTP_KEY,
  allowLocalNetwork: IMAGE_ALLOW_LOCAL_KEY,
  allowNoCors: IMAGE_ALLOW_NO_CORS_KEY,
};

/** Origens permitidas neste navegador; valor ausente ou corrompido vira lista vazia. */
export function loadAllowedOrigins(): readonly string[] {
  const raw = readSetting(IMAGE_ORIGINS_KEY);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const origins = parsed.filter(
      (item): item is string => typeof item === 'string' && item !== '',
    );
    return [...new Set(origins)];
  } catch {
    return [];
  }
}

export function saveAllowedOrigins(origins: readonly string[]): void {
  writeSetting(IMAGE_ORIGINS_KEY, JSON.stringify([...new Set(origins)]));
}

/** Os quatro interruptores; todos desligados por padrão (só o texto `on` liga). */
export function loadImageSwitches(): ImageSwitches {
  const on = (name: ImageSwitchName) => readSetting(SWITCH_KEYS[name]) === 'on';
  return {
    allowAnyOrigin: on('allowAnyOrigin'),
    allowHttp: on('allowHttp'),
    allowLocalNetwork: on('allowLocalNetwork'),
    allowNoCors: on('allowNoCors'),
  };
}

export function saveImageSwitch(name: ImageSwitchName, value: boolean): void {
  writeSetting(SWITCH_KEYS[name], value ? 'on' : 'off');
}
