const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const service = require('../main/services/project-service');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'focus-dock-test-'));
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'a.js'), "import { b } from './b.js';\nexport const a = b + 1;\n");
  await fs.writeFile(path.join(root, 'src', 'b.js'), 'export const b = 2;\n');
  await fs.writeFile(path.join(root, 'ignored.bin'), Buffer.from([0, 1, 2]));

  const project = await service.scanProject(root);
  assert.equal(project.files.length, 2);
  const codemap = service.buildStructuralCodemap(project);
  assert.equal(codemap.nodes.length, 2);
  assert.equal(codemap.edges.length, 1);
  assert.ok(codemap.areas.length >= 1);

  const read = await service.readText(root, 'src/a.js');
  assert.match(read.content, /export const a/);
  await service.writeText(root, 'src/b.js', 'export const b = 3;\n');
  assert.match((await service.readText(root, 'src/b.js')).content, /3/);
  await assert.rejects(() => service.readText(root, '../outside.txt'));

  const symbols = service.extractSymbols('export class Canvas {\n  render() {\n    return true;\n  }\n  async select(id) {\n    return id;\n  }\n}\n','src/canvas.js');
  assert.equal(symbols.find((item) => item.name === 'render').startLine,2);
  assert.equal(symbols.find((item) => item.name === 'select').startLine,5);
  const location = service.resolveNodeLocation({ path:'src/canvas.js',preview:'',symbols },{ symbol:'select' });
  assert.equal(location.startLine,5);
  assert.ok(location.endLine >= location.startLine);

  await fs.rm(root, { recursive: true, force: true });
  console.log('project-service tests: ok');
})().catch((error) => { console.error(error); process.exit(1); });
