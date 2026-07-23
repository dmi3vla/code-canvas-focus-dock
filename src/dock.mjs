function escapeHtml(value='') { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
function markdown(value='') {
  const blocks=[]; let source=escapeHtml(value).replace(/```([\w-]*)\n([\s\S]*?)```/g,(_,lang,code)=>{ const token=`@@${blocks.length}@@`; blocks.push(`<div class="answer-code"><header><span>${lang||'code'}</span><button type="button">Copy</button></header><pre><code>${code}</code></pre></div>`); return token; });
  source=source.replace(/^### (.+)$/gm,'<h4>$1</h4>').replace(/^## (.+)$/gm,'<h3>$1</h3>').replace(/^# (.+)$/gm,'<h2>$1</h2>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>').replace(/^[-*] (.+)$/gm,'<div class="answer-list">• $1</div>').replace(/\n/g,'<br>');
  blocks.forEach((block,index)=>{ source=source.replace(`@@${index}@@`,block); }); return source;
}

export class FocusDock {
  constructor({ root, api, onMode, onClearSelection }) {
    this.root=root; this.api=api; this.onMode=onMode; this.onClearSelection=onClearSelection; this.mode='chat'; this.selected=null; this.map=null; this.file=null; this.history=[]; this.requestId=null;
    this.codePanel=document.getElementById('code-panel'); this.chatPanel=document.getElementById('chat-panel'); this.editor=document.getElementById('code-editor'); this.gutter=document.getElementById('code-gutter'); this.filePath=document.getElementById('file-path'); this.locationBadge=document.getElementById('location-badge'); this.saveButton=document.getElementById('save-file');
    this.messages=document.getElementById('chat-messages'); this.empty=document.getElementById('chat-empty'); this.input=document.getElementById('chat-input'); this.send=document.getElementById('chat-send'); this.contextChip=document.getElementById('context-chip');
    this.bind(); this.setMode('chat');
  }
  bind() {
    document.querySelectorAll('.dock-tab').forEach((button)=>button.addEventListener('click',()=>this.setMode(button.dataset.mode)));
    document.getElementById('clear-selection').addEventListener('click',()=>this.onClearSelection?.());
    this.saveButton.addEventListener('click',()=>this.saveFile());
    this.editor.addEventListener('input',()=>this.updateGutter());
    this.editor.addEventListener('scroll',()=>{this.gutter.scrollTop=this.editor.scrollTop;});
    document.getElementById('new-chat').addEventListener('click',()=>this.clearChat());
    this.input.addEventListener('input',()=>this.resizeComposer());
    this.input.addEventListener('keydown',(event)=>{ if(event.key==='Escape'&&this.requestId){event.preventDefault();this.stop();} else if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();this.sendMessage();} });
    this.send.addEventListener('click',()=>this.requestId?this.stop():this.sendMessage());
    this.messages.querySelectorAll('.prompt-list button').forEach((button)=>button.addEventListener('click',()=>this.sendMessage(button.textContent)));
  }
  setMode(mode) {
    this.mode=['code','chat','split'].includes(mode)?mode:'chat'; this.root.dataset.dockMode=this.mode;
    document.querySelectorAll('.dock-tab').forEach((button)=>button.classList.toggle('active',button.dataset.mode===this.mode));
    this.codePanel.hidden=this.mode==='chat'; this.chatPanel.hidden=this.mode==='code'; this.onMode?.(this.mode);
  }
  async setSelection(node,map) {
    this.selected=node; this.map=map;
    this.contextChip.textContent=node?.path?`${node.symbol || node.title} · L${node.startLine || 1}`:'No node selected'; this.contextChip.classList.toggle('muted',!node);
    document.getElementById('selection-label').textContent=node?.path?`${node.path}:${node.startLine || 1}`:'Nothing selected';
    if (!node) {
      this.file=null; this.filePath.textContent='Select a symbol node'; this.locationBadge.textContent='—'; this.editor.value=''; this.gutter.textContent='1'; this.editor.disabled=true; this.saveButton.disabled=true;
    }
  }
  async openLocation(location) {
    if (!location?.path) return;
    this.setMode('code');
    await this.openFile(location.path, location);
  }
  async openFile(path,location={}) {
    try {
      const result=await this.api.readFile(path); this.file=result; this.filePath.textContent=result.path; this.editor.value=result.content; this.editor.disabled=false; this.saveButton.disabled=false;
      this.locationBadge.textContent=`${location.symbol || 'file'} · L${location.startLine || 1}${location.endLine && location.endLine !== location.startLine ? `–${location.endLine}` : ''}`;
      document.getElementById('dock-subtitle').textContent=result.path; this.updateGutter();
      requestAnimationFrame(()=>this.revealLocation(location));
    } catch(error){ this.filePath.textContent=error.message||String(error); }
  }
  updateGutter() {
    const count=Math.max(1,this.editor.value.split('\n').length); this.gutter.textContent=Array.from({length:count},(_,index)=>index+1).join('\n'); this.gutter.scrollTop=this.editor.scrollTop;
  }
  revealLocation({startLine=1,endLine=startLine}={}) {
    const lines=this.editor.value.split('\n'); const safeStart=Math.min(lines.length,Math.max(1,Number(startLine)||1)); const safeEnd=Math.min(lines.length,Math.max(safeStart,Number(endLine)||safeStart));
    const offsetAt=(line)=>lines.slice(0,line-1).reduce((total,item)=>total+item.length+1,0); const startOffset=offsetAt(safeStart); const endOffset=offsetAt(safeEnd)+lines[safeEnd-1].length;
    this.editor.focus({preventScroll:true}); this.editor.setSelectionRange(startOffset,endOffset);
    const lineHeight=parseFloat(getComputedStyle(this.editor).lineHeight)||16; this.editor.scrollTop=Math.max(0,(safeStart-1)*lineHeight-this.editor.clientHeight*.28); this.gutter.scrollTop=this.editor.scrollTop;
    const shell=this.editor.closest('.editor-shell'); shell?.classList.remove('location-flash'); requestAnimationFrame(()=>shell?.classList.add('location-flash')); setTimeout(()=>shell?.classList.remove('location-flash'),900);
  }
  async saveFile() { if(!this.file)return; this.saveButton.disabled=true; try{ await this.api.writeFile(this.file.path,this.editor.value); this.file.content=this.editor.value; this.saveButton.textContent='Saved'; setTimeout(()=>this.saveButton.textContent='Save file',1200); } finally{ this.saveButton.disabled=false; } }
  context() { const mapSummary=this.map?JSON.stringify({title:this.map.title,areas:this.map.areas?.map((a)=>a.title),nodes:this.map.nodes?.slice(0,60).map((n)=>({title:n.title,path:n.path,summary:n.summary}))}):''; return [this.selected?`Selected node: ${JSON.stringify(this.selected)}`:'',this.file?`Selected file content:\n${this.file.content.slice(0,14000)}`:'',`Codemap:\n${mapSummary.slice(0,6000)}`].filter(Boolean).join('\n\n'); }
  addMessage(role,text,streaming=false) { this.empty?.remove(); const row=document.createElement('article'); row.className=`chat-message ${role}${streaming?' streaming':''}`; row.innerHTML=`<div class="chat-avatar">${role==='assistant'?'AI':'YOU'}</div><div class="chat-bubble"></div>`; const bubble=row.querySelector('.chat-bubble'); if(role==='assistant')bubble.innerHTML=markdown(text);else bubble.textContent=text; this.messages.appendChild(row); this.messages.scrollTop=this.messages.scrollHeight; return{row,bubble}; }
  bindCopy(row){ row.querySelectorAll('.answer-code button').forEach((button)=>button.addEventListener('click',async()=>{ const text=button.closest('.answer-code').querySelector('code').textContent; await navigator.clipboard.writeText(text); button.textContent='Copied'; setTimeout(()=>button.textContent='Copy',1000); })); }
  async sendMessage(prefill='') {
    if(this.requestId)return this.stop(); const message=String(prefill||this.input.value).trim(); if(!message)return;
    const history=this.history.slice(-12); this.history.push({role:'user',content:message}); this.addMessage('user',message); this.input.value='';this.resizeComposer();
    const requestId=`chat-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;this.requestId=requestId;this.setBusy(true);const target=this.addMessage('assistant','',true);let text='',done=false;
    const finish=(fallback='')=>{if(done)return;done=true;target.row.classList.remove('streaming');text=text||fallback;target.bubble.innerHTML=markdown(text);this.bindCopy(target.row);if(text)this.history.push({role:'assistant',content:text});};
    const unsub=this.api.onChatChunk((chunk)=>{if(chunk.requestId!==requestId)return;if(chunk.type==='text'){text+=chunk.content||'';target.bubble.innerHTML=markdown(text);this.messages.scrollTop=this.messages.scrollHeight;}else if(chunk.type==='finish')finish();else if(chunk.type==='aborted')finish('Stopped.');else if(chunk.type==='error')finish(`⚠️ ${chunk.error}`);});
    try{const result=await this.api.sendChat({requestId,message,history,context:this.context()});if(!result.ok&&!result.aborted)finish(`⚠️ ${result.error}`);else finish(result.text||text||'Stopped.');}catch(error){finish(`⚠️ ${error.message||error}`);}finally{unsub();if(this.requestId===requestId)this.requestId=null;this.setBusy(false);this.input.focus();}
  }
  stop(){if(this.requestId)this.api.stopChat(this.requestId);}
  setBusy(busy){this.input.disabled=busy;this.send.disabled=false;this.send.textContent=busy?'■':'↑';this.send.classList.toggle('stop',busy);this.send.setAttribute('aria-label',busy?'Stop generation':'Send message');if(!busy)this.send.disabled=!this.input.value.trim();}
  resizeComposer(){this.input.style.height='auto';this.input.style.height=`${Math.min(150,Math.max(28,this.input.scrollHeight))}px`;if(!this.requestId)this.send.disabled=!this.input.value.trim();}
  clearChat(){if(this.requestId)return;this.history=[];this.messages.innerHTML='';const empty=document.createElement('div');empty.id='chat-empty';empty.className='chat-empty';empty.innerHTML='<div class="chat-empty-mark">✦</div><h2>New conversation</h2><p>Select a node or ask about the current codemap.</p>';this.messages.appendChild(empty);this.empty=empty;}
}
