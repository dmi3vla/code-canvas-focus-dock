import { CanvasView } from './canvas.mjs';
import { FocusDock } from './dock.mjs';

const api=window.focusDock;
const app=document.getElementById('app');
const status=document.getElementById('status');
const empty=document.getElementById('canvas-empty');
const projectLabel=document.getElementById('project-label');
const mapMeta=document.getElementById('map-meta');
const zoomLabel=document.getElementById('zoom-label');
const canvasElement=document.getElementById('canvas');
const textView=document.getElementById('canvas-text-view');
const textToggle=document.getElementById('text-view-toggle');
let project=null;
let canvasMode='graph';
let currentCodemap=null;

function setStatus(text){status.textContent=text;}
let canvas;
const dock=new FocusDock({root:app,api,onClearSelection:()=>canvas?.select(null)});
canvas=new CanvasView({canvas:document.getElementById('canvas'),world:document.getElementById('world'),edges:document.getElementById('edges'),onSelect:handleNodeSelection,onStatus:({scale})=>zoomLabel.textContent=`${Math.round(scale*100)}%`});

function loadMap(codemap){currentCodemap=codemap;canvas.setMap(codemap);empty.classList.toggle('hidden',Boolean(codemap?.nodes?.length));mapMeta.textContent=`${codemap?.traces?.length||codemap?.areas?.length||0} flows · ${codemap?.nodes?.length||0} locations`;renderTextView(codemap);dock.setSelection(null,codemap);}

function codemapTraces(codemap){
  if(Array.isArray(codemap?.traces)&&codemap.traces.length)return codemap.traces;
  return (codemap?.areas||[]).map((area,index)=>({id:String(index+1),title:area.title,description:'Structural project area',traceGuide:'',locations:(codemap.nodes||[]).filter(node=>node.areaId===area.id).map((node,nodeIndex)=>({id:`${index+1}${String.fromCharCode(97+nodeIndex)}`,nodeId:node.id,path:node.path,lineNumber:node.startLine||1,lineContent:node.lineContent||'',title:node.title,description:node.summary}))}));
}
function appendGuide(container,guide=''){
  for(const raw of String(guide).split('\n')){const line=raw.trim();if(!line)continue;const element=document.createElement(line.startsWith('## ')?'h4':'p');element.textContent=line.replace(/^##\s+/,'');container.appendChild(element);}
}
function renderTextView(codemap){
  textView.innerHTML='';
  const header=document.createElement('header');header.className='text-map-header';const title=document.createElement('h2');title.textContent=codemap?.title||'Code map';const description=document.createElement('p');description.textContent=codemap?.description||'Ordered architecture flows and source locations.';header.append(title,description);textView.appendChild(header);
  const traces=document.createElement('div');traces.className='text-traces';
  for(const trace of codemapTraces(codemap)){const section=document.createElement('section');section.className='text-trace';const traceHead=document.createElement('header');const badge=document.createElement('span');badge.textContent=trace.id;const heading=document.createElement('div');const h3=document.createElement('h3');h3.textContent=trace.title;const sub=document.createElement('p');sub.textContent=trace.description||'';heading.append(h3,sub);traceHead.append(badge,heading);section.appendChild(traceHead);if(trace.traceGuide){const guide=document.createElement('div');guide.className='trace-guide-text';appendGuide(guide,trace.traceGuide);section.appendChild(guide);}const list=document.createElement('div');list.className='text-location-list';for(const location of trace.locations||[]){const node=currentCodemap?.nodes?.find(item=>item.id===location.nodeId||item.locationId===location.id);const button=document.createElement('button');button.className='text-location';const id=document.createElement('b');id.textContent=location.id;const body=document.createElement('span');const label=document.createElement('strong');label.textContent=location.title||node?.title||location.path;const meta=document.createElement('code');meta.textContent=`${location.path}:${location.lineNumber||node?.startLine||1}`;const desc=document.createElement('small');desc.textContent=location.description||location.lineContent||node?.summary||'';body.append(label,meta,desc);button.append(id,body);button.addEventListener('click',()=>navigateToLocation({nodeId:node?.id||location.nodeId||null,path:location.path,symbol:node?.symbol||location.title,startLine:location.lineNumber||node?.startLine||1,endLine:node?.endLine||location.lineNumber||1},{source:'text'}));list.appendChild(button);}section.appendChild(list);traces.appendChild(section);}textView.appendChild(traces);
}
function setCanvasMode(mode){canvasMode=mode==='text'?'text':'graph';canvasElement.classList.toggle('text-mode',canvasMode==='text');textView.hidden=canvasMode!=='text';textToggle.classList.toggle('active',canvasMode==='text');textToggle.setAttribute('aria-pressed',String(canvasMode==='text'));setStatus(canvasMode==='text'?'Text flow view':'Graph view');}

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
async function openCanvas(){try{const result=await api.openCanvas();if(!result.canceled){currentCodemap=result.data.map;canvas.restore(result.data);renderTextView(result.data.map);empty.classList.add('hidden');mapMeta.textContent=`${result.data.map?.title||'Canvas'} · opened file`;dock.setSelection(null,result.data.map);setStatus(`Opened ${result.path}`);}}catch(error){setStatus(error.message||String(error));}}

const settingsModal=document.getElementById('settings-modal');
async function openSettings(){const settings=await api.getSettings();document.getElementById('base-url').value=settings.baseUrl||'';document.getElementById('model').value=settings.model||'';document.getElementById('language').value=settings.language||'Русский';document.getElementById('api-key').value='';document.getElementById('key-state').textContent=settings.hasApiKey?`Key saved · ${settings.storageProtected?'OS encryption':'file permissions only'}`:'No API key saved';settingsModal.classList.remove('hidden');}
function closeSettings(){settingsModal.classList.add('hidden');}
document.getElementById('settings-form').addEventListener('submit',async(event)=>{event.preventDefault();await api.setSettings({apiKey:document.getElementById('api-key').value,baseUrl:document.getElementById('base-url').value,model:document.getElementById('model').value,language:document.getElementById('language').value});closeSettings();setStatus('AI settings saved');});
document.getElementById('clear-key').addEventListener('click',async()=>{await api.setSettings({clearApiKey:true});closeSettings();setStatus('API key removed');});

document.getElementById('open-project').addEventListener('click',openProject);document.getElementById('empty-open').addEventListener('click',openProject);document.getElementById('generate').addEventListener('click',generate);document.getElementById('save-canvas').addEventListener('click',saveCanvas);document.getElementById('open-canvas').addEventListener('click',openCanvas);document.getElementById('fit-view').addEventListener('click',()=>canvasMode==='text'?textView.scrollTo({top:0,behavior:'smooth'}):canvas.fit());textToggle.addEventListener('click',()=>setCanvasMode(canvasMode==='text'?'graph':'text'));
document.getElementById('pan-tool').addEventListener('click',()=>setTool('pan'));document.getElementById('select-tool').addEventListener('click',()=>setTool('select'));
function setTool(tool){canvas.setTool(tool);document.querySelectorAll('.button.tool').forEach((button)=>button.classList.toggle('active',button.id.startsWith(tool)));setStatus(`${tool[0].toUpperCase()+tool.slice(1)} tool`);}
document.getElementById('settings-open').addEventListener('click',openSettings);document.getElementById('settings-close').addEventListener('click',closeSettings);settingsModal.addEventListener('pointerdown',(event)=>{if(event.target===settingsModal)closeSettings();});
document.getElementById('window-min').addEventListener('click',()=>api.minimize());document.getElementById('window-max').addEventListener('click',()=>api.toggleMaximize());document.getElementById('window-close').addEventListener('click',()=>api.close());
window.addEventListener('keydown',(event)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='o'){event.preventDefault();openProject();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();saveCanvas();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='j'){event.preventDefault();dock.setMode('chat');document.getElementById('chat-input').focus();}if(event.key==='Escape'){if(app.dataset.rightPanel==='fullscreen')setRightPanel('open');else closeSettings();}});
api.version().then((version)=>setStatus(`Ready · v${version}`)).catch(()=>setStatus('Ready'));
