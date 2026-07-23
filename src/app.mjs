import { CanvasView } from './canvas.mjs';
import { FocusDock } from './dock.mjs';

const api=window.focusDock;
const app=document.getElementById('app');
const status=document.getElementById('status');
const empty=document.getElementById('canvas-empty');
const projectLabel=document.getElementById('project-label');
const mapMeta=document.getElementById('map-meta');
const zoomLabel=document.getElementById('zoom-label');
let project=null;

function setStatus(text){status.textContent=text;}
let canvas;
const dock=new FocusDock({root:app,api,onClearSelection:()=>canvas?.select(null)});
canvas=new CanvasView({canvas:document.getElementById('canvas'),world:document.getElementById('world'),edges:document.getElementById('edges'),onSelect:handleNodeSelection,onStatus:({scale})=>zoomLabel.textContent=`${Math.round(scale*100)}%`});

function loadMap(codemap){canvas.setMap(codemap);empty.classList.toggle('hidden',Boolean(codemap?.nodes?.length));mapMeta.textContent=`${codemap?.nodes?.length||0} files`;dock.setSelection(null,codemap);}

function renderProjectTree(files=[]){
  const tree=document.getElementById('project-tree');
  const groups=new Map();
  for(const file of files.slice(0,120)){const parts=file.path.split('/');const group=parts.length>1?parts.shift():'root';if(!groups.has(group))groups.set(group,[]);groups.get(group).push({name:parts.join('/')||file.path,path:file.path});}
  tree.innerHTML='';
  for(const [group,items] of groups){const folder=document.createElement('div');folder.className='tree-row folder open';folder.innerHTML=`<span>⌄</span><b>${group}</b>`;tree.appendChild(folder);for(const item of items.slice(0,24)){const row=document.createElement('button');row.className='tree-row file';row.dataset.path=item.path;row.innerHTML=`<i class="file-dot ${/css|html/.test(item.path)?'mint':/json|yaml/.test(item.path)?'yellow':''}"></i><span>${item.name}</span>`;row.addEventListener('click',()=>{
    const node = canvas?.map?.nodes?.find((n) => n.path === item.path);
    navigateToLocation({
      nodeId: node?.id || null,
      path: item.path,
      symbol: node?.symbol || null,
      startLine: node?.startLine || 1,
      endLine: node?.endLine || 1
    }, { source: 'tree' });
  });tree.appendChild(row);}}
}

let activeLocation = null;
let navigationSequence = 0;

function normalizePath(value=''){return String(value).replaceAll('\\','/').replace(/^\.\//,'');}

function expandParentFolders(row) {
  let parent = row.closest('.tree-folder');
  while (parent) {
    parent.classList.add('open');
    const toggle = parent.querySelector(':scope > .folder-row');
    toggle?.setAttribute('aria-expanded', 'true');
    parent = parent.parentElement?.closest('.tree-folder');
  }
}

function revealProjectFile(path) {
  if (!path) return false;
  const target = normalizePath(path);
  const tree = document.getElementById('project-tree');
  const rows = [...tree.querySelectorAll('.tree-row.file[data-path]')];
  const row = rows.find((item) => normalizePath(item.dataset.path) === target);

  if (!row) return false;

  expandParentFolders(row);

  tree.querySelectorAll('.tree-row.active').forEach((element) => element.classList.remove('active'));
  tree.querySelectorAll('[aria-current]').forEach((element) => element.removeAttribute('aria-current'));

  row.classList.add('active');
  row.setAttribute('aria-current', 'true');
  row.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });

  return true;
}

async function navigateToLocation(location, options = {}) {
  if (!location) return;
  const sequence = ++navigationSequence;
  activeLocation = location;

  if (app.dataset.leftPanel !== 'open') setLeftPanel('open');
  if (app.dataset.rightPanel === 'closed' || app.dataset.rightPanel === 'collapsed') setRightPanel('open');

  if (options.source !== 'graph' && location.nodeId) {
    canvas.select(location.nodeId, { emit: false });
  }

  revealProjectFile(location.path);

  const node = location.nodeId ? canvas?.map?.nodes?.find((n) => n.id === location.nodeId) : null;
  dock.setSelection(node, canvas?.map);

  await dock.openLocation(location);

  if (sequence !== navigationSequence) {
    return;
  }
}

async function handleNodeSelection(node, map) {
  if (!node) {
    await dock.setSelection(null, map);
    return;
  }
  await navigateToLocation({
    nodeId: node.id,
    path: node.path,
    symbol: node.symbol,
    startLine: node.startLine,
    endLine: node.endLine
  }, { source: 'graph' });
}

function refreshPanelControls(){
  const left=app.dataset.leftPanel||'open',right=app.dataset.rightPanel||'open';
  document.getElementById('left-panel-collapse').textContent=left==='collapsed'?'›':'‹';
  document.getElementById('left-panel-collapse').title=left==='collapsed'?'Expand project panel':'Collapse project panel';
  document.getElementById('right-panel-collapse').textContent=right==='collapsed'?'‹':'›';
  document.getElementById('right-panel-collapse').title=right==='collapsed'?'Expand assistant':'Collapse assistant';
  document.getElementById('right-panel-fullscreen').textContent=right==='fullscreen'?'❐':'⛶';
  document.getElementById('right-panel-fullscreen').title=right==='fullscreen'?'Exit fullscreen':'Fullscreen assistant';
  document.getElementById('left-panel-reopen').classList.toggle('hidden',left!=='closed');
  document.getElementById('right-panel-reopen').classList.toggle('hidden',right!=='closed');
}
function setLeftPanel(state){app.dataset.leftPanel=['open','collapsed','closed'].includes(state)?state:'open';refreshPanelControls();requestAnimationFrame(()=>canvas?.fit());}
function setRightPanel(state){app.dataset.rightPanel=['open','collapsed','closed','fullscreen'].includes(state)?state:'open';refreshPanelControls();requestAnimationFrame(()=>canvas?.fit());}

document.getElementById('left-panel-collapse').addEventListener('click',()=>setLeftPanel(app.dataset.leftPanel==='collapsed'?'open':'collapsed'));
document.getElementById('left-panel-close').addEventListener('click',()=>setLeftPanel('closed'));
document.getElementById('left-panel-reopen').addEventListener('click',()=>setLeftPanel('open'));
document.getElementById('right-panel-collapse').addEventListener('click',()=>setRightPanel(app.dataset.rightPanel==='collapsed'?'open':'collapsed'));
document.getElementById('right-panel-fullscreen').addEventListener('click',()=>setRightPanel(app.dataset.rightPanel==='fullscreen'?'open':'fullscreen'));
document.getElementById('right-panel-close').addEventListener('click',()=>setRightPanel('closed'));
document.getElementById('right-panel-reopen').addEventListener('click',()=>setRightPanel('open'));
refreshPanelControls();

async function openProject(){setStatus('Scanning project…');try{const result=await api.openProject();if(result.canceled){setStatus('Open canceled');return;}project=result.project;projectLabel.textContent=`${project.name} · ${project.fileCount} files`;renderProjectTree(project.files||[]);loadMap(result.codemap);setStatus(result.codemap.source==='structural'?'Structural map ready':'Cached map loaded');}catch(error){setStatus(error.message||String(error));}}

async function generate(){if(!project){setStatus('Open a project first');return;}const button=document.getElementById('generate');button.disabled=true;button.textContent='Generating…';setStatus('AI is analyzing the project…');try{const result=await api.generateCodemap(document.getElementById('query').value);if(!result.ok)throw new Error(result.error);loadMap(result.codemap);setStatus('AI codemap ready');}catch(error){setStatus(error.message||String(error));if(String(error.message||error).toLowerCase().includes('api key'))openSettings();}finally{button.disabled=false;button.textContent='✦ Generate';}}

async function saveCanvas(){try{const result=await api.saveCanvas(canvas.serialize());setStatus(result.canceled?'Save canceled':`Saved ${result.path}`);}catch(error){setStatus(error.message||String(error));}}
async function openCanvas(){try{const result=await api.openCanvas();if(!result.canceled){canvas.restore(result.data);empty.classList.add('hidden');mapMeta.textContent=`${result.data.map?.title||'Canvas'} · opened file`;dock.setSelection(null,result.data.map);setStatus(`Opened ${result.path}`);}}catch(error){setStatus(error.message||String(error));}}

const settingsModal=document.getElementById('settings-modal');
async function openSettings(){const settings=await api.getSettings();document.getElementById('base-url').value=settings.baseUrl||'';document.getElementById('model').value=settings.model||'';document.getElementById('language').value=settings.language||'Русский';document.getElementById('api-key').value='';document.getElementById('key-state').textContent=settings.hasApiKey?`Key saved · ${settings.storageProtected?'OS encryption':'file permissions only'}`:'No API key saved';settingsModal.classList.remove('hidden');}
function closeSettings(){settingsModal.classList.add('hidden');}
document.getElementById('settings-form').addEventListener('submit',async(event)=>{event.preventDefault();await api.setSettings({apiKey:document.getElementById('api-key').value,baseUrl:document.getElementById('base-url').value,model:document.getElementById('model').value,language:document.getElementById('language').value});closeSettings();setStatus('AI settings saved');});
document.getElementById('clear-key').addEventListener('click',async()=>{await api.setSettings({clearApiKey:true});closeSettings();setStatus('API key removed');});

document.getElementById('open-project').addEventListener('click',openProject);document.getElementById('empty-open').addEventListener('click',openProject);document.getElementById('generate').addEventListener('click',generate);document.getElementById('save-canvas').addEventListener('click',saveCanvas);document.getElementById('open-canvas').addEventListener('click',openCanvas);document.getElementById('fit-view').addEventListener('click',()=>canvas.fit());
document.getElementById('pan-tool').addEventListener('click',()=>setTool('pan'));document.getElementById('select-tool').addEventListener('click',()=>setTool('select'));
function setTool(tool){canvas.setTool(tool);document.querySelectorAll('.button.tool').forEach((button)=>button.classList.toggle('active',button.id.startsWith(tool)));setStatus(`${tool[0].toUpperCase()+tool.slice(1)} tool`);}
document.getElementById('settings-open').addEventListener('click',openSettings);document.getElementById('settings-close').addEventListener('click',closeSettings);settingsModal.addEventListener('pointerdown',(event)=>{if(event.target===settingsModal)closeSettings();});
document.getElementById('window-min').addEventListener('click',()=>api.minimize());document.getElementById('window-max').addEventListener('click',()=>api.toggleMaximize());document.getElementById('window-close').addEventListener('click',()=>api.close());
window.addEventListener('keydown',(event)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='o'){event.preventDefault();openProject();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();saveCanvas();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='j'){event.preventDefault();dock.setMode('chat');document.getElementById('chat-input').focus();}if(event.key==='Escape'){if(app.dataset.rightPanel==='fullscreen')setRightPanel('open');else closeSettings();}});
api.version().then((version)=>setStatus(`Ready · v${version}`)).catch(()=>setStatus('Ready'));
