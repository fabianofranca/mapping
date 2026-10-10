import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelError, createProject } from '../../src/model';
import { runBatch } from '../../mcp/batch';
import { ToolError } from '../../mcp/errors';
import { decodeImage } from '../../mcp/image/codecs';
import { MAX_BASE64_LENGTH, MAX_FILE_BYTES, MAX_PIXELS } from '../../mcp/image/formats';
import { MODEL_ERROR_MESSAGES } from '../../mcp/modelErrors';
import { operationSchema } from '../../mcp/operations';
import { failure } from '../../mcp/tools';
import { NOW } from '../model/fixtures';

// Limites de memória do servidor: pixels decodificados e tamanho do base64 recebido.

/** Cabeçalho PNG (sem pixels) que declara `width × height`. */
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  ]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof ToolError ? error.code : String(error);
  }
}

afterEach(() => vi.restoreAllMocks());

describe('teto de pixels', () => {
  it('é de 40 megapixels', () => {
    expect(MAX_PIXELS).toBe(40_000_000);
  });

  it('recusa pelo cabeçalho uma imagem de 48 megapixels, antes de decodificar', async () => {
    expect(await codeOf(decodeImage(pngHeader(8000, 6000)))).toBe('image-too-large');
  });

  it('não recusa por pixels uma imagem dentro do teto (o cabeçalho sem dados é inválido)', async () => {
    expect(await codeOf(decodeImage(pngHeader(6000, 6000)))).toBe('invalid-image');
  });
});

describe('base64 das operações de imagem', () => {
  it('o limite corresponde a MAX_FILE_BYTES', () => {
    expect(MAX_BASE64_LENGTH).toBe(Math.ceil(MAX_FILE_BYTES / 3) * 4);
  });

  it('o schema recusa texto muito acima do limite', () => {
    const big = 'A'.repeat(MAX_BASE64_LENGTH * 2);
    for (const op of ['add_image', 'replace_image'] as const) {
      const parsed = operationSchema.safeParse({ op, image: 'i:00000000', base64: big });
      expect(parsed.success).toBe(false);
      expect(JSON.stringify(parsed.error?.issues)).toContain('too_big');
    }
  });

  it('acima do limite, recusa antes de decodificar (sem Buffer.from)', async () => {
    const from = vi.spyOn(Buffer, 'from');
    const project = createProject({
      name: 'Limites',
      now: NOW,
      firstLayer: {
        id: 'cccccccc-0000-4000-8000-000000000001',
        name: 'C',
        color: '#D32F2F',
      },
    });
    const result = await runBatch(
      {
        location: { name: 'limites', dir: '/tmp/limites', root: '/tmp', path: 'limites' },
        project,
        readOnly: false,
        migratedFrom: null,
        specWarnings: [],
      },
      [{ op: 'add_image', base64: 'A'.repeat(MAX_BASE64_LENGTH + 4) }],
      {
        readSource: () => Promise.reject(new Error('sem arquivos')),
        takenImageFiles: new Set(),
        now: () => NOW,
      },
    );
    expect(result.errors[0]?.code).toBe('image-too-large');
    expect(
      from.mock.calls.some(([arg]) => typeof arg === 'string' && arg.length > 1000),
    ).toBe(false);
  });
});

describe('failure() das tools', () => {
  it('erro de regra do modelo vira o código e a explicação, não internal-error', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const result = failure(new ModelError('locked', 'm-1'));
    expect(result.isError).toBe(true);
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual({
      error: { code: 'locked', message: MODEL_ERROR_MESSAGES.locked, detail: 'm-1' },
    });
    expect(stderr).not.toHaveBeenCalled();
  });
});
