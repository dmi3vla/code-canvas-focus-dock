const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('focusDock', {
  openProject:() => ipcRenderer.invoke('project:open'),
  structuralMap:() => ipcRenderer.invoke('project:structural'),
  generateCodemap:(query) => ipcRenderer.invoke('codemap:generate',{ query }),
  readFile:(path) => ipcRenderer.invoke('file:read',path),
  writeFile:(path,content) => ipcRenderer.invoke('file:write',{ path,content }),
  saveCanvas:(data) => ipcRenderer.invoke('canvas:saveAs',data),
  openCanvas:() => ipcRenderer.invoke('canvas:open'),
  getSettings:() => ipcRenderer.invoke('settings:get'),
  setSettings:(patch) => ipcRenderer.invoke('settings:set',patch),
  sendChat:(payload) => ipcRenderer.invoke('chat:send',payload),
  stopChat:(requestId) => ipcRenderer.invoke('chat:stop',requestId),
  onChatChunk:(callback) => { const listener = (_,chunk) => callback(chunk); ipcRenderer.on('chat:chunk',listener); return () => ipcRenderer.removeListener('chat:chunk',listener); },
  version:() => ipcRenderer.invoke('app:version'),
  minimize:() => ipcRenderer.send('window:minimize'),
  toggleMaximize:() => ipcRenderer.send('window:toggleMaximize'),
  close:() => ipcRenderer.send('window:close'),
  isMaximized:() => ipcRenderer.invoke('window:isMaximized')
});
