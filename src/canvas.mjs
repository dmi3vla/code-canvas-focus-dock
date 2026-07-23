export class CanvasView {
  constructor({ canvas, world, edges, onSelect, onStatus }) {
    this.canvas = canvas; this.world = world; this.edges = edges; this.onSelect = onSelect; this.onStatus = onStatus;
    this.map = { areas:[],nodes:[],edges:[] };
    this.view = { x:60,y:50,scale:1 }; this.tool = 'pan'; this.selectedId = null; this.drag = null;
    this.bind();
  }
  bind() {
    this.canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const px = event.clientX - rect.left, py = event.clientY - rect.top;
      const old = this.view.scale;
      const next = Math.min(2.4,Math.max(.22,old * (event.deltaY > 0 ? .9 : 1.1)));
      const wx = (px - this.view.x) / old, wy = (py - this.view.y) / old;
      this.view.scale = next; this.view.x = px - wx * next; this.view.y = py - wy * next;
      this.applyView();
    }, { passive:false });
    this.canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('.map-node')) return;
      if (this.tool !== 'pan') { this.select(null); return; }
      this.drag = { type:'pan',x:event.clientX,y:event.clientY,startX:this.view.x,startY:this.view.y };
      this.canvas.setPointerCapture(event.pointerId); this.canvas.classList.add('is-panning');
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.drag) return;
      if (this.drag.type === 'pan') {
        this.view.x = this.drag.startX + event.clientX - this.drag.x;
        this.view.y = this.drag.startY + event.clientY - this.drag.y;
      } else {
        const node = this.map.nodes.find((item) => item.id === this.drag.nodeId);
        if (node) { node.x = this.drag.startX + (event.clientX - this.drag.x) / this.view.scale; node.y = this.drag.startY + (event.clientY - this.drag.y) / this.view.scale; }
      }
      this.applyView(); this.renderEdges(); if (this.drag.type === 'node') this.positionNode(this.drag.nodeId);
    });
    this.canvas.addEventListener('pointerup', () => { this.drag = null; this.canvas.classList.remove('is-panning'); });
  }
  setTool(tool) { this.tool = tool === 'select' ? 'select' : 'pan'; this.canvas.dataset.tool = this.tool; }
  setMap(map) { this.map = structuredClone(map || { areas:[],nodes:[],edges:[] }); this.selectedId = null; this.render(); requestAnimationFrame(() => this.fit()); }
  serialize() { return { type:'code-canvas-focus-dock',version:1,map:this.map,view:this.view }; }
  restore(data) { if (!data?.map) throw new Error('Invalid canvas file'); this.map = data.map; this.view = data.view || this.view; this.render(); this.applyView(); }
  render() {
    this.world.innerHTML = '';
    for (const area of this.map.areas || []) {
      const el = document.createElement('section'); el.className = 'map-area'; el.dataset.areaId = area.id;
      el.style.cssText = `left:${area.x}px;top:${area.y}px;width:${area.width}px;height:${area.height}px;--area:${area.color || '#72a9ed'};`;
      const title = document.createElement('div'); title.className = 'map-area-title'; title.textContent = area.title || 'Area'; el.appendChild(title); this.world.appendChild(el);
    }
    for (const node of this.map.nodes || []) {
      const el = document.createElement('article'); el.className = 'map-node'; el.dataset.nodeId = node.id; el.tabIndex = 0;
      const area = this.map.areas.find((item) => item.id === node.areaId);
      el.style.setProperty('--node-accent',area?.color || '#72a9ed');
      el.innerHTML = '<div class="node-top"><span class="node-file"></span><span class="node-kind"></span></div><div class="node-symbol"></div><p></p><div class="node-path"></div>'; 
      el.querySelector('.node-file').textContent = node.title || 'Untitled'; el.querySelector('.node-kind').textContent = node.type || 'file';
      const symbol = node.symbol || node.title || 'file'; el.querySelector('.node-symbol').textContent = `${symbol} · L${node.startLine || 1}`;
      el.querySelector('p').textContent = node.summary || 'Source symbol'; el.querySelector('.node-path').textContent = node.path || '';
      el.addEventListener('click', (event) => { event.stopPropagation(); this.select(node.id); });
      el.addEventListener('keydown', (event) => { if (event.key === 'Enter') this.select(node.id); });
      el.addEventListener('pointerdown', (event) => { if (event.button !== 0) return; event.stopPropagation(); this.drag = { type:'node',nodeId:node.id,x:event.clientX,y:event.clientY,startX:node.x,startY:node.y,moved:false }; el.setPointerCapture(event.pointerId); });
      el.addEventListener('pointerup', (event) => { if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId); });
      this.world.appendChild(el); this.positionNode(node.id);
    }
    this.renderEdges(); this.applyView();
  }
  positionNode(id) { const node = this.map.nodes.find((item) => item.id === id); const el = this.world.querySelector(`[data-node-id="${CSS.escape(id)}"]`); if (node && el) { el.style.left=`${node.x}px`; el.style.top=`${node.y}px`; el.style.width=`${node.width || 180}px`; el.style.height=`${node.height || 100}px`; } }
  renderEdges() {
    this.edges.innerHTML = '';
    const ns = 'http://www.w3.org/2000/svg';
    for (const edge of this.map.edges || []) {
      const from = this.map.nodes.find((node) => node.id === edge.from), to = this.map.nodes.find((node) => node.id === edge.to); if (!from || !to) continue;
      const x1 = from.x + (from.width || 180), y1 = from.y + (from.height || 100)/2, x2 = to.x, y2 = to.y + (to.height || 100)/2;
      const bend = Math.max(60,Math.abs(x2-x1)*.42); const path = document.createElementNS(ns,'path');
      path.setAttribute('d',`M ${x1} ${y1} C ${x1+bend} ${y1}, ${x2-bend} ${y2}, ${x2} ${y2}`); path.setAttribute('class','map-edge'); this.edges.appendChild(path);
    }
  }
  applyView() { const transform = `translate(${this.view.x}px,${this.view.y}px) scale(${this.view.scale})`; this.world.style.transform = transform; this.edges.style.transform = transform; this.onStatus?.({ scale:this.view.scale }); }
  select(id, options = {}) {
    this.selectedId = id; this.world.querySelectorAll('.map-node').forEach((el) => el.classList.toggle('selected',el.dataset.nodeId === id));
    const node = this.map.nodes.find((item) => item.id === id) || null;
    if (options.emit !== false) this.onSelect?.(node,this.map);
  }
  selectPath(path) { const node=this.map.nodes.find((item)=>item.path===path); if(node)this.select(node.id); }
  fit() {
    const nodes = this.map.nodes || []; if (!nodes.length) return;
    const minX = Math.min(...nodes.map((n) => n.x)), minY = Math.min(...nodes.map((n) => n.y));
    const maxX = Math.max(...nodes.map((n) => n.x+(n.width||180))), maxY = Math.max(...nodes.map((n) => n.y+(n.height||100)));
    const rect = this.canvas.getBoundingClientRect(), pad = 80; const scale = Math.min(1.25,Math.max(.22,Math.min((rect.width-pad*2)/(maxX-minX),(rect.height-pad*2)/(maxY-minY))));
    this.view = { scale,x:(rect.width-(maxX-minX)*scale)/2-minX*scale,y:(rect.height-(maxY-minY)*scale)/2-minY*scale }; this.applyView();
  }
}
