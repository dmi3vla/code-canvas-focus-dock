const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');

const EXTENSIONS = new Set(['.js','.jsx','.ts','.tsx','.mjs','.cjs','.json','.css','.scss','.html','.md','.py','.go','.rs','.java','.kt','.swift','.yaml','.yml','.sol','.c','.h','.cpp','.hpp']);
const IGNORE = new Set(['node_modules','.git','dist','build','coverage','.next','vendor','.idea']);
const MAX_FILES = 300;
const MAX_FILE_BYTES = 256000;
const CANVAS_CACHE = '.focus-dock.canvas.json';
const CODEMAP_CACHE = '.focus-dock.codemap.json';

function assertInside(root, candidate) {
  if (!root) throw new Error('Project is not open');
  const rootReal = fsSync.realpathSync(root);
  const resolved = path.resolve(root, candidate);
  let existing = resolved;
  const tail = [];
  while (!fsSync.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    tail.unshift(path.basename(existing));
    existing = parent;
  }
  const canonicalBase = fsSync.existsSync(existing) ? fsSync.realpathSync(existing) : existing;
  const canonical = path.join(canonicalBase, ...tail);
  const rel = path.relative(rootReal, canonical);
  if (rel && (rel.startsWith('..') || path.isAbsolute(rel))) throw new Error('Path is outside the project');
  return canonical;
}

async function walk(root) {
  const files = [];
  async function visit(dir, depth) {
    if (files.length >= MAX_FILES || depth > 12) return;
    let entries = [];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a,b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= MAX_FILES) break;
      if (entry.name.startsWith('.') || IGNORE.has(entry.name)) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(absolute, depth + 1);
      else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        try {
          const stat = await fs.stat(absolute);
          if (stat.size <= MAX_FILE_BYTES) files.push({ path: path.relative(root, absolute).replace(/\\/g,'/'), size: stat.size });
        } catch { /* skip */ }
      }
    }
  }
  await visit(root, 0);
  return files;
}

function extractSymbols(content, filePath = '') {
  const lines = String(content || '').split('\n');
  const symbols = [];
  const blocked = new Set(['if','for','while','switch','catch','with','constructor']);
  const add = (name, line, kind = 'method') => {
    if (!name || blocked.has(name) || symbols.some((item) => item.name === name && item.startLine === line)) return;
    symbols.push({ name, kind, startLine:line, endLine:line });
  };
  lines.forEach((line,index) => {
    const lineNumber = index + 1;
    let match = line.match(/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (match) return add(match[1],lineNumber,'function');
    match = line.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/);
    if (match) return add(match[1],lineNumber,'function');
    match = line.match(/^\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/);
    if (match) return add(match[1],lineNumber,'class');
    match = line.match(/^\s*(?:async\s+)?(?:static\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\([^;]*\)\s*\{/);
    if (match) return add(match[1],lineNumber,'method');
    match = line.match(/^\s*(?:async\s+)?def\s+([A-Za-z_][\w]*)\s*\(/);
    if (match) return add(match[1],lineNumber,'function');
    match = line.match(/^\s*class\s+([A-Za-z_][\w]*)\s*[:(]/);
    if (match) return add(match[1],lineNumber,'class');
  });
  symbols.sort((a,b) => a.startLine - b.startLine);
  symbols.forEach((symbol,index) => { symbol.endLine = Math.max(symbol.startLine, (symbols[index + 1]?.startLine || lines.length + 1) - 1); });
  return symbols.slice(0,80).map((symbol) => ({ ...symbol, path:filePath }));
}

function resolveNodeLocation(file, node = {}) {
  const symbols = Array.isArray(file?.symbols) ? file.symbols : [];
  const requestedLine = Number(node.startLine || node.lineNumber || 0);
  if (requestedLine > 0) {
    const atLine = symbols.find((item) => requestedLine >= item.startLine && requestedLine <= item.endLine);
    return { symbol:String(node.symbol || atLine?.name || node.title || path.posix.basename(file.path)), startLine:requestedLine, endLine:Number(node.endLine || atLine?.endLine || requestedLine), kind:atLine?.kind || node.type || 'location' };
  }
  const needle = String(node.symbol || node.title || '').toLowerCase().replace(/\.[^.]+$/,'');
  const match = symbols.find((item) => needle === item.name.toLowerCase() || needle.includes(item.name.toLowerCase()) || item.name.toLowerCase().includes(needle));
  const symbol = match || symbols[0];
  if (symbol) return { symbol:symbol.name,startLine:symbol.startLine,endLine:symbol.endLine,kind:symbol.kind };
  const firstLine = String(file?.preview || '').split('\n').findIndex((line) => line.trim() && !line.trim().startsWith('//')) + 1;
  return { symbol:path.posix.basename(file?.path || ''),startLine:Math.max(1,firstLine),endLine:Math.max(1,firstLine),kind:'file' };
}

function enrichCodemapLocations(codemap, project) {
  const files = new Map((project?.files || []).map((file) => [file.path,file]));
  const nodes = (codemap?.nodes || []).map((node) => {
    const file = files.get(String(node.path || '').replace(/\\/g,'/'));
    return file ? { ...node, ...resolveNodeLocation(file,node) } : node;
  });
  return { ...codemap, nodes };
}

async function scanProject(root) {
  const files = await walk(root);
  const enriched = [];
  for (const file of files) {
    let content = '';
    try { content = await fs.readFile(path.join(root, file.path), 'utf8'); } catch { /* skip */ }
    enriched.push({ ...file, preview:content.slice(0,5000), symbols:extractSymbols(content,file.path) });
  }
  return { root, name: path.basename(root), files: enriched, truncated: files.length >= MAX_FILES };
}

function importSpecs(content) {
  const specs = [];
  const patterns = [
    /(?:import[\s\S]*?from\s*|import\s*|require\s*\()\s*['\"]([^'\"]+)['\"]/g,
    /^\s*from\s+([.\w]+)\s+import/gm,
    /^\s*#\s*include\s+[\"<]([^\">]+)[\">]/gm
  ];
  for (const pattern of patterns) for (const match of content.matchAll(pattern)) specs.push(match[1]);
  return specs;
}

function resolveSpec(fromPath, spec, known) {
  if (!spec.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), spec));
  const candidates = [base,`${base}.js`,`${base}.jsx`,`${base}.ts`,`${base}.tsx`,`${base}.py`,`${base}/index.js`,`${base}/index.ts`,`${base}/__init__.py`];
  return candidates.find((candidate) => known.has(candidate)) || null;
}

function colorFor(index) {
  return ['#67c7ba','#72a9ed','#b397e4','#e5b76b','#df879f','#72be8e'][index % 6];
}

function buildStructuralCodemap(project) {
  const known = new Set(project.files.map((file) => file.path));
  const areaMap = new Map();
  for (const file of project.files) {
    const area = file.path.includes('/') ? file.path.split('/')[0] : 'root';
    if (!areaMap.has(area)) areaMap.set(area, []);
    areaMap.get(area).push(file);
  }
  const areas = [...areaMap.keys()].slice(0, 10).map((title,index) => ({ id:`area-${index}`, title, color:colorFor(index) }));
  const areaId = new Map(areas.map((area) => [area.title, area.id]));
  const included = project.files.slice(0, 80);
  const nodes = included.map((file,index) => {
    const area = file.path.includes('/') ? file.path.split('/')[0] : 'root';
    const location = resolveNodeLocation(file,{ title:path.posix.basename(file.path) });
    return { id:`node-${index}`, title:path.posix.basename(file.path), path:file.path, summary:firstMeaningfulLine(file.preview), areaId:areaId.get(area) || areas[0]?.id, type:location.kind, ...location };
  });
  const nodeByPath = new Map(nodes.map((node) => [node.path,node]));
  const edges = [];
  for (const file of included) {
    const from = nodeByPath.get(file.path);
    if (!from) continue;
    for (const spec of importSpecs(file.preview)) {
      const targetPath = resolveSpec(file.path, spec, known);
      const to = nodeByPath.get(targetPath);
      if (to && edges.length < 160 && !edges.some((edge) => edge.from === from.id && edge.to === to.id)) edges.push({ id:`edge-${edges.length}`, from:from.id, to:to.id, label:'imports' });
    }
  }
  return layoutCodemap({ title:`${project.name} architecture`, query:'Structural import map', areas, nodes, edges, generatedAt:new Date().toISOString(), source:'structural' });
}

function firstMeaningfulLine(content) {
  return String(content || '').split('\n').map((line) => line.trim()).find((line) => line && !line.startsWith('//') && !line.startsWith('/*'))?.slice(0,120) || 'Source file';
}

function layoutCodemap(codemap) {
  const areas = Array.isArray(codemap.areas) && codemap.areas.length ? codemap.areas : [{ id:'area-0', title:'Project', color:'#72a9ed' }];
  const nodes = Array.isArray(codemap.nodes) ? codemap.nodes : [];
  const validAreaIds = new Set(areas.map((area) => area.id));
  for (const node of nodes) if (!validAreaIds.has(node.areaId)) node.areaId = areas[0].id;
  const columns = Math.max(1, Math.ceil(Math.sqrt(areas.length)));
  const areaW = 620, areaH = 420, gap = 100;
  areas.forEach((area,index) => { area.x = (index % columns) * (areaW + gap) + 80; area.y = Math.floor(index / columns) * (areaH + gap) + 80; area.width = areaW; area.height = areaH; });
  for (const area of areas) {
    const children = nodes.filter((node) => node.areaId === area.id);
    const cols = Math.max(1, Math.ceil(Math.sqrt(children.length || 1)));
    children.forEach((node,index) => { node.x = area.x + 35 + (index % cols) * 210; node.y = area.y + 62 + Math.floor(index / cols) * 135; node.width = 180; node.height = 100; });
  }
  return { ...codemap, areas, nodes, edges:Array.isArray(codemap.edges) ? codemap.edges : [] };
}

async function readText(root, relativePath) {
  const absolute = assertInside(root, relativePath);
  const stat = await fs.stat(absolute);
  if (!stat.isFile() || stat.size > 2_000_000) throw new Error('File is too large or invalid');
  return { path: path.relative(root, absolute).replace(/\\/g,'/'), content: await fs.readFile(absolute,'utf8') };
}

async function writeText(root, relativePath, content) {
  const absolute = assertInside(root, relativePath);
  await fs.writeFile(absolute, String(content ?? ''), 'utf8');
  return { path:path.relative(root,absolute).replace(/\\/g,'/') };
}

async function readCache(root) {
  try { return JSON.parse(await fs.readFile(path.join(root,CODEMAP_CACHE),'utf8')); } catch { return null; }
}
async function writeCache(root, codemap) {
  await fs.writeFile(path.join(root,CODEMAP_CACHE), JSON.stringify(codemap,null,2),'utf8');
  return path.join(root,CODEMAP_CACHE);
}

module.exports = { scanProject, buildStructuralCodemap, layoutCodemap, extractSymbols, resolveNodeLocation, enrichCodemapLocations, readText, writeText, readCache, writeCache, CANVAS_CACHE, CODEMAP_CACHE, assertInside };
