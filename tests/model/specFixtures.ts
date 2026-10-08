import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addAnnotation,
  addImage,
  addLayer,
  addTableRow,
  addTypedAnnotation,
  applySpecialization,
  createMarking,
  parseSpecText,
  projectLayerFor,
  setFieldValue,
  setPlatformRepo,
  setTableCell,
  type JsonValue,
  type Project,
  type Spec,
} from '../../src/model';
import { emptyProject } from './fixtures';

export function loadExample(name: 'sdui' | 'modelo-de-dados'): Spec {
  // A partir da raiz do projeto: no ambiente jsdom, `import.meta.url` não é `file:`.
  const text = readFileSync(
    join(process.cwd(), 'examples', 'specs', `${name}.json`),
    'utf8',
  );
  const parsed = parseSpecText(text);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

/** Gerador de ids previsíveis: `prefix1`, `prefix2`… */
export function idGen(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}

/** Id da camada do projeto criada a partir da camada da especialização. */
export function layerOf(p: Project, specId: string, specLayerId: string): string {
  const layer = projectLayerFor(p, specId, specLayerId);
  if (!layer) throw new Error(`camada ${specId}/${specLayerId} não encontrada`);
  return layer.id;
}

/** Projeto com a camada livre Model e as duas especializações aplicadas (passo 1 da 13.9). */
export function specProject(): Project {
  let p = emptyProject();
  p = addLayer(p, { id: 'LM', name: 'Model', color: '#757575' });
  p = applySpecialization(p, loadExample('sdui'), { newId: idGen('LS') });
  p = applySpecialization(p, loadExample('modelo-de-dados'), { newId: idGen('LD') });
  return p;
}

function typed(
  p: Project,
  id: string,
  markingId: string,
  specId: string,
  typeId: string,
  values: Record<string, JsonValue>,
  owner?: string,
): Project {
  const layers: Record<string, string> = {
    button: 'componentes',
    input: 'componentes',
    text: 'componentes',
    image: 'componentes',
    onClick: 'eventos',
    onHold: 'eventos',
    onChange: 'eventos',
    screen: 'telas',
    classe: 'classes',
    endpoint: 'endpoints',
  };
  const layerId = layerOf(p, specId, layers[typeId] ?? '');
  let next = addTypedAnnotation(p, {
    id,
    markingId,
    layerId,
    type: { specId, typeId },
    parentAnnotationId: owner ?? null,
  });
  for (const [key, value] of Object.entries(values)) {
    next = setFieldValue(next, id, key, value);
  }
  return next;
}

/**
 * Tela de cadastro do roteiro da 13.9 (passos 2 a 7): Formulário › Nome, Idade,
 * E-mail, Cadastrar; e Título. Anotações:
 * - AU (Model, livre, Formulário): User com EN `name: string` e EA `age: number`;
 * - AC (Classe, Formulário): Contato, com a linha R1 `email` em `atributos`;
 * - AIN/AII/AIE: Inputs com `dado` → User.name, User.age e Contato.email;
 * - AB: Button do Cadastrar, com AOC (onClick) e AOH (onHold) vinculados;
 * - AT: Text do Título com `id` vazio (incompleta);
 * - AOE: onChange do E-mail; AE: Endpoint no Formulário.
 */
export function cadastroProject(): Project {
  let p = specProject();
  p = addImage(p, { id: 'I1', file: 'images/cadastro.png', width: 1000, height: 2000 });
  const rect = (x: number, y: number, width: number, height: number) => ({
    x,
    y,
    width,
    height,
  });
  p = createMarking(p, {
    id: 'MT',
    imageId: 'I1',
    rect: rect(100, 50, 800, 100),
    name: 'Título',
  });
  p = createMarking(p, {
    id: 'MF',
    imageId: 'I1',
    rect: rect(50, 200, 900, 1200),
    name: 'Formulário',
  });
  p = createMarking(p, {
    id: 'MN',
    imageId: 'I1',
    rect: rect(100, 250, 800, 100),
    name: 'Nome',
  });
  p = createMarking(p, {
    id: 'MI',
    imageId: 'I1',
    rect: rect(100, 400, 800, 100),
    name: 'Idade',
  });
  p = createMarking(p, {
    id: 'ME',
    imageId: 'I1',
    rect: rect(100, 550, 800, 100),
    name: 'E-mail',
  });
  p = createMarking(p, {
    id: 'MC',
    imageId: 'I1',
    rect: rect(100, 700, 800, 100),
    name: 'Cadastrar',
  });

  p = addAnnotation(p, {
    id: 'AU',
    markingId: 'MF',
    layerId: 'LM',
    name: 'User',
    entries: [
      { id: 'EN', key: 'name', value: 'string' },
      { id: 'EA', key: 'age', value: 'number' },
    ],
  });
  p = typed(p, 'AC', 'MF', 'modelo-dados', 'classe', {
    nome: 'Contato',
    revisadoEm: '2026-10-02',
  });
  p = addTableRow(p, 'AC', 'atributos', 'R1');
  p = setTableCell(p, 'AC', 'atributos', 'R1', 'nome', 'email');
  p = setTableCell(p, 'AC', 'atributos', 'R1', 'tipo', 'String');
  p = setTableCell(p, 'AC', 'atributos', 'R1', 'exemplo', 'ana@exemplo.com');

  p = typed(p, 'AIN', 'MN', 'sdui', 'input', {
    id: 'input_nome',
    dado: { annotationId: 'AU', entryId: 'EN' },
  });
  p = typed(p, 'AII', 'MI', 'sdui', 'input', {
    id: 'input_idade',
    tipo: 'number',
    dado: { annotationId: 'AU', entryId: 'EA' },
  });
  p = typed(p, 'AIE', 'ME', 'sdui', 'input', {
    id: 'input_email',
    tipo: 'email',
    obrigatorio: 'sim',
    dado: { annotationId: 'AC', key: 'atributos', rowId: 'R1' },
  });
  p = typed(p, 'AB', 'MC', 'sdui', 'button', { id: 'btn_cadastrar', texto: 'Cadastrar' });
  p = typed(p, 'AT', 'MT', 'sdui', 'text', { conteudo: 'Crie sua conta' });

  p = typed(
    p,
    'AOC',
    'MC',
    'sdui',
    'onClick',
    { acao: 'submit', destino: '/usuarios' },
    'AB',
  );
  p = addTableRow(p, 'AOC', 'parametros', 'RP1');
  p = setTableCell(p, 'AOC', 'parametros', 'RP1', 'nome', 'origem');
  p = setTableCell(p, 'AOC', 'parametros', 'RP1', 'valor', 'cadastro');
  p = typed(p, 'AOH', 'MC', 'sdui', 'onHold', { acao: 'track' }, 'AB');
  p = typed(
    p,
    'AOE',
    'ME',
    'sdui',
    'onChange',
    { acao: 'validate', regra: 'email' },
    'AIE',
  );
  p = typed(p, 'AE', 'MF', 'modelo-dados', 'endpoint', {
    metodo: 'POST',
    path: '/v1/usuarios',
    request: 'User',
    response: 'User',
  });
  return p;
}

/** Caminhos do Screen `Cadastro` em `codeProject` (passo 3 do roteiro da 3b). */
export const CADASTRO_SCREEN_KT = 'app/src/main/java/com/app/cadastro/CadastroScreen.kt';
export const CADASTRO_VIEW_MODEL_KT =
  'app/src/main/java/com/app/cadastro/CadastroViewModel.kt';
export const CADASTRO_VIEW_SWIFT = 'App/Cadastro/CadastroView.swift';

/**
 * `cadastroProject` com o roteiro da 3b (passos 2 e 3): o Screen `AS` (`Cadastro`,
 * `rota: /cadastro`) no Formulário, com duas entradas Android em `implementacao` (C1,
 * C2 com linha) e uma iOS (C3); repositório configurado só para `android`.
 */
export function codeProject(): Project {
  let p = typed(cadastroProject(), 'AS', 'MF', 'sdui', 'screen', {
    nome: 'Cadastro',
    rota: '/cadastro',
    implementacao: [
      {
        _id: 'C1',
        platform: 'android',
        path: CADASTRO_SCREEN_KT,
        symbol: 'CadastroScreen',
        line: null,
      },
      {
        _id: 'C2',
        platform: 'android',
        path: CADASTRO_VIEW_MODEL_KT,
        symbol: 'CadastroViewModel',
        line: 42,
      },
      {
        _id: 'C3',
        platform: 'ios',
        path: CADASTRO_VIEW_SWIFT,
        symbol: 'CadastroView',
        line: null,
      },
    ],
  });
  p = setPlatformRepo(p, 'android', {
    urlTemplate: 'https://github.com/org/app-android/blob/main/{path}#L{line}',
    localPath: '../../..',
  });
  return p;
}
