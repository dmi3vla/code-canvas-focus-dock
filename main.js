const { app, BrowserWindow, dialog, ipcMain, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const projectService = require('./main/services/project-service');
const settingsService = require('./main/services/settings-service');
const aiService = require('./main/services/ai-service');

let projectRoot = null;
let projectSnapshot = null;
const chatControllers = new Map();

const CSP = ["default-src 'self'","script-src 'self'","style-src 'self' 'unsafe-inline'","img-src 'self' data: blob:","font-src 'self' data:","connect-src 'self'","object-src 'none'","base-uri 'self'","frame-src 'none'"].join('; ');

function createWindow() {
  const win = new BrowserWindow({
    width:1600,
    height:1000,
    minWidth:1050,
    minHeight:700,
    show:false,
    frame:false,
    backgroundColor:'#080c16',
    webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true, nodeIntegration:false, sandbox:true }
  });
  win.webContents.setWindowOpenHandler(() => ({ action:'deny' }));
  win.webContents.on('will-navigate', (event,url) => { if (url !== win.webContents.getURL()) event.preventDefault(); });
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      const isControlOrMeta = input.control || input.meta;
      if ((isControlOrMeta && input.shift && input.key.toLowerCase() === 'i') || input.key === 'F12') {
        win.webContents.toggleDevTools();
        event.preventDefault();
      }
    }
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname,'src','index.html'));
  return win;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  session.defaultSession.webRequest.onHeadersReceived((details,callback) => callback({ responseHeaders:{ ...details.responseHeaders, 'Content-Security-Policy':[CSP] } }));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.on('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
ipcMain.on('window:toggleMaximize', (event) => { const win = BrowserWindow.fromWebContents(event.sender); if (win) win.isMaximized() ? win.unmaximize() : win.maximize(); });
ipcMain.on('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());
ipcMain.handle('window:isMaximized', (event) => Boolean(BrowserWindow.fromWebContents(event.sender)?.isMaximized()));

ipcMain.handle('project:open', async () => {
  const result = await dialog.showOpenDialog({ properties:['openDirectory'] });
  if (result.canceled || !result.filePaths[0]) return { canceled:true };
  projectRoot = result.filePaths[0];
  projectSnapshot = await projectService.scanProject(projectRoot);
  const cached = await projectService.readCache(projectRoot);
  const baseCodemap = cached || projectService.buildStructuralCodemap(projectSnapshot);
  const codemap = projectService.enrichCodemapLocations(baseCodemap,projectSnapshot);
  if (!cached) await projectService.writeCache(projectRoot,codemap);
  return { canceled:false, project:{ name:projectSnapshot.name, root:projectRoot, fileCount:projectSnapshot.files.length, truncated:projectSnapshot.truncated, files:projectSnapshot.files.map((file) => ({ path:file.path, size:file.size, symbols:file.symbols })) }, codemap };
});

ipcMain.handle('project:structural', async () => {
  if (!projectSnapshot) throw new Error('Open a project first');
  const codemap = projectService.buildStructuralCodemap(projectSnapshot);
  await projectService.writeCache(projectRoot,codemap);
  return codemap;
});

ipcMain.handle('codemap:generate', async (_, payload = {}) => {
  if (!projectSnapshot) return { ok:false,error:'Open a project first' };
  try {
    const query = String(payload.query || 'Explain the architecture and key execution flows').slice(0,2000);
    const codemap = await aiService.generateCodemap(projectSnapshot,query);
    await projectService.writeCache(projectRoot,codemap);
    return { ok:true,codemap };
  } catch (error) { return { ok:false,error:error.message || String(error) }; }
});

ipcMain.handle('file:read', async (_, relativePath) => projectService.readText(projectRoot,String(relativePath || '')));
ipcMain.handle('file:write', async (_, payload = {}) => projectService.writeText(projectRoot,String(payload.path || ''),String(payload.content ?? '')));

ipcMain.handle('canvas:saveAs', async (_, data) => {
  const result = await dialog.showSaveDialog({ defaultPath:projectRoot ? path.join(projectRoot,'workspace.canvas') : 'workspace.canvas', filters:[{ name:'Code Canvas',extensions:['canvas','json'] }] });
  if (result.canceled || !result.filePath) return { canceled:true };
  await fs.writeFile(result.filePath,JSON.stringify(data,null,2),'utf8');
  return { canceled:false,path:result.filePath };
});
ipcMain.handle('canvas:open', async () => {
  const result = await dialog.showOpenDialog({ properties:['openFile'],filters:[{ name:'Code Canvas',extensions:['canvas','json'] }] });
  if (result.canceled || !result.filePaths[0]) return { canceled:true };
  return { canceled:false,path:result.filePaths[0],data:JSON.parse(await fs.readFile(result.filePaths[0],'utf8')) };
});

ipcMain.handle('settings:get', () => settingsService.getPublicSettings());
ipcMain.handle('settings:set', (_, patch) => settingsService.updateSettings(patch || {}));

ipcMain.handle('chat:send', async (event,payload = {}) => {
  const requestId = String(payload.requestId || `chat-${Date.now()}`).slice(0,120);
  const message = String(payload.message || '').trim().slice(0,12000);
  if (!message) return { ok:false,requestId,error:'Message is required' };
  const controller = new AbortController();
  chatControllers.set(requestId,controller);
  const send = (chunk) => { try { event.sender.send('chat:chunk',{ requestId,...chunk }); } catch { /* closed */ } };
  try {
    const result = await aiService.streamChat({
      message,
      context:String(payload.context || '').slice(0,20000),
      history:Array.isArray(payload.history) ? payload.history : [],
      signal:controller.signal,
      onDelta:(content) => send({ type:'text',content })
    });
    send({ type:'finish',finishReason:result.finishReason });
    return { ok:true,requestId,text:result.text };
  } catch (error) {
    const aborted = controller.signal.aborted;
    const messageText = aborted ? 'Stopped' : error.message || String(error);
    send({ type:aborted ? 'aborted' : 'error',error:messageText });
    return { ok:false,requestId,aborted,error:messageText };
  } finally { chatControllers.delete(requestId); }
});
ipcMain.handle('chat:stop', (_,requestId) => { const controller = chatControllers.get(String(requestId || '')); if (!controller) return { ok:false }; controller.abort(); chatControllers.delete(String(requestId)); return { ok:true }; });

ipcMain.handle('app:version', () => app.getVersion());
