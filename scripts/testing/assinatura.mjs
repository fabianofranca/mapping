// assinatura.mjs: helper for test script R26 ("Import the signature", docs/TESTING.md).
//
//   node assinatura.mjs gravar <output.txt> <package folder> <sheet.json> <specialization file> [n]
//     Reads the stdio client output (`mcp-stdio-client.mjs … > output.txt`), finds the nth response
//     of `plan_signature_import` (the 1st by default) and writes what the agent writes after the
//     preview: its `spec` in the specialization file (inside the package folder) and the sheet, the
//     same JSON, at `signaturePath` inside the package. It is only what the tool recommends in the
//     `hint`; the tool still writes nothing.
//   node assinatura.mjs igual <output.txt> <specialization file> [n]
//     Checks whether the `spec` of the nth response is the content of the file (reimporting changes
//     nothing): prints `equal` or `different` (and exits with 1).
//
// Node only, no dependency.
import fs from 'node:fs';
import path from 'node:path';

const [cmd, ...args] = process.argv.slice(2);

/** The nth `plan_signature_import` response in the stdio client output (JSON, not an error). */
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
        `response ${n} is the error ${result.error.code}: ${result.error.message}`,
      );
    }
    return result;
  }
  throw new Error(`the output has no response ${n} of plan_signature_import`);
}

function fail(message) {
  console.error(message);
  process.exit(2);
}

try {
  if (cmd === 'gravar' && args.length >= 4) {
    const [output, pack, sheet, specFile, n] = args;
    const plan = nthPlan(output, Number(n ?? 1));
    const target = path.resolve(pack, plan.signaturePath);
    const inside = path.relative(path.resolve(pack), target);
    if (inside === '' || inside.startsWith('..') || path.isAbsolute(inside)) {
      fail(
        `the signaturePath "${plan.signaturePath}" goes outside the package: nothing was written`,
      );
    }
    fs.writeFileSync(
      path.join(pack, specFile),
      JSON.stringify(plan.spec, null, 2) + '\n',
    );
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(sheet, target);
    console.log(`written: ${specFile} and ${plan.signaturePath}`);
  } else if (cmd === 'igual' && args.length >= 2) {
    const [output, specFile, n] = args;
    const plan = nthPlan(output, Number(n ?? 1));
    const written = JSON.parse(fs.readFileSync(specFile, 'utf8'));
    const equal = JSON.stringify(written) === JSON.stringify(plan.spec);
    console.log(equal ? 'equal' : 'different');
    process.exit(equal ? 0 : 1);
  } else {
    fail(
      'usage: assinatura.mjs gravar <output.txt> <package> <sheet.json> <specialization file> [n]\n' +
        '       assinatura.mjs igual <output.txt> <specialization file> [n]',
    );
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
