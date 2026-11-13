// assinatura.mjs: ajudante do roteiro R26 ("Importar a assinatura", docs/TESTING.md).
//
//   node assinatura.mjs gravar <saida.txt> <pasta do pacote> <ficha.json> <arquivo da especialização> [n]
//     Lê a saída do cliente stdio (`mcp-stdio-client.mjs … > saida.txt`), acha a n-ésima resposta
//     de `plan_signature_import` (a 1ª por padrão) e grava o que o agente grava depois da prévia:
//     o `spec` dela no arquivo da especialização (dentro da pasta do pacote) e a ficha, o mesmo
//     JSON, em `signaturePath` dentro do pacote. É só o que a tool recomenda no `hint`; a tool
//     continua sem gravar nada.
//   node assinatura.mjs igual <saida.txt> <arquivo da especialização> [n]
//     Confere se o `spec` da n-ésima resposta é o conteúdo do arquivo (reimportar não muda nada):
//     imprime `igual` ou `diferente` (e sai com 1).
//
// Só Node, sem dependência.
import fs from 'node:fs';
import path from 'node:path';

const [cmd, ...args] = process.argv.slice(2);

/** A n-ésima resposta de `plan_signature_import` na saída do cliente stdio (JSON, não erro). */
function nthPlan(file, n) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  let seen = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== '=== plan_signature_import') continue;
    seen += 1;
    if (seen !== n) continue;
    const body = [];
    for (let j = i + 1; j < lines.length && !lines[j].startsWith('=== '); j++) {
      body.push(lines[j]);
    }
    const parsed = JSON.parse(body.join('\n'));
    const text = Array.isArray(parsed) ? parsed[0] : parsed;
    const result = JSON.parse(text);
    if (result.error) {
      throw new Error(
        `a resposta ${n} é o erro ${result.error.code}: ${result.error.message}`,
      );
    }
    return result;
  }
  throw new Error(`a saída não tem a resposta ${n} de plan_signature_import`);
}

function fail(message) {
  console.error(message);
  process.exit(2);
}

try {
  if (cmd === 'gravar' && args.length >= 4) {
    const [saida, pacote, ficha, specFile, n] = args;
    const plan = nthPlan(saida, Number(n ?? 1));
    const alvo = path.resolve(pacote, plan.signaturePath);
    const dentro = path.relative(path.resolve(pacote), alvo);
    if (dentro === '' || dentro.startsWith('..') || path.isAbsolute(dentro)) {
      fail(
        `o signaturePath "${plan.signaturePath}" sai fora do pacote: nada foi gravado`,
      );
    }
    fs.writeFileSync(
      path.join(pacote, specFile),
      JSON.stringify(plan.spec, null, 2) + '\n',
    );
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.copyFileSync(ficha, alvo);
    console.log(`gravado: ${specFile} e ${plan.signaturePath}`);
  } else if (cmd === 'igual' && args.length >= 2) {
    const [saida, specFile, n] = args;
    const plan = nthPlan(saida, Number(n ?? 1));
    const gravado = JSON.parse(fs.readFileSync(specFile, 'utf8'));
    const igual = JSON.stringify(gravado) === JSON.stringify(plan.spec);
    console.log(igual ? 'igual' : 'diferente');
    process.exit(igual ? 0 : 1);
  } else {
    fail(
      'uso: assinatura.mjs gravar <saida.txt> <pacote> <ficha.json> <arquivo da especialização> [n]\n' +
        '     assinatura.mjs igual <saida.txt> <arquivo da especialização> [n]',
    );
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
