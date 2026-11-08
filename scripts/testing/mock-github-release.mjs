// Servidor local que imita o GitHub para o R21 (etapa #877): o download direto da release, a API
// de assets e a CDN deles, servindo os arquivos de uma pasta. Só Node, sem dependências.
//   node scripts/testing/mock-github-release.mjs <pasta da release> [--direct <status>] [--api <status>]
// --direct troca a resposta do download direto (ex.: 504); --api, a do JSON da release e dos assets.
// Escuta em 127.0.0.1, porta livre; a primeira linha da saída é a URL base (aponte
// MAPPING_GITHUB_BASE para ela e MAPPING_GITHUB_API para <base>/api); cada requisição vira uma
// linha "GET <caminho>" depois dela. Encerra com Ctrl+C ou kill.
import { readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const dir = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const option = (name) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? 200 : Number(args[at + 1]);
};
if (!dir) {
  console.error(
    'uso: node mock-github-release.mjs <pasta da release> [--direct <status>] [--api <status>]',
  );
  process.exit(2);
}
const direct = option('direct');
const api = option('api');
const names = readdirSync(dir).sort();
const REPO = '/fabianofranca/mapping';
const API = '/api/repos/fabianofranca/mapping';

const server = createServer((req, res) => {
  const url = req.url ?? '';
  console.log(`${req.method} ${url}`);
  const send = (status, body = 'erro', headers = {}) => {
    res.writeHead(status, headers);
    res.end(body);
  };
  const file = new RegExp(
    `^${REPO}/releases/(?:latest/download|download/[^/]+)/([^/]+)$`,
  ).exec(url);
  if (file) {
    if (direct !== 200) return send(direct);
    return names.includes(file[1])
      ? send(200, readFileSync(join(dir, file[1])))
      : send(404);
  }
  if (new RegExp(`^${API}/releases/(?:latest|tags/[^/]+)$`).test(url)) {
    if (api !== 200) return send(api);
    const assets = names.map((name, i) => ({ name, id: i + 1 }));
    return send(200, JSON.stringify({ assets }), { 'content-type': 'application/json' });
  }
  const asset = new RegExp(`^${API}/releases/assets/(\\d+)$`).exec(url);
  if (asset) {
    if (api !== 200) return send(api);
    return req.headers.accept === 'application/octet-stream'
      ? send(302, '', { location: `/cdn/${asset[1]}` })
      : send(415);
  }
  const cdn = /^\/cdn\/(\d+)$/.exec(url);
  if (cdn && names[Number(cdn[1]) - 1])
    return send(200, readFileSync(join(dir, names[Number(cdn[1]) - 1])));
  return send(404);
});
server.listen(0, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${server.address().port}`);
});
