// Shared HTML Graphics lifecycle; measurements are supplied only by Grafana queries.
if (htmlNode.__aiCleanup) htmlNode.__aiCleanup();
const app = (() => {
  const el=id=>htmlNode.getElementById(id), root=htmlNode.querySelector('.ai');
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const state={data:{},meta:null,paused:media.matches,error:false,disposed:false};
  const listeners=[];
  let renderer=()=>{};
  const text=(id,value)=>{ if(el(id)) el(id).textContent=value; };
  const num=(value,digits=1)=>Number.isFinite(value)?value.toFixed(digits):'—';
  const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:min));
  function listen(target,type,handler) { target.addEventListener(type,handler); listeners.push(()=>target.removeEventListener(type,handler)); }
  function svg(tag,attrs={},parent) { const n=document.createElementNS('http://www.w3.org/2000/svg',tag); for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v)); if(parent)parent.appendChild(n);return n; }
  function label(parent,x,y,value,cls='svg-label',anchor='start') { const n=svg('text',{x,y,class:cls,'text-anchor':anchor},parent);n.textContent=value;return n; }
  function rows(frame) { if(!frame?.fields?.length)return [];const out=[];for(let i=0;i<frame.fields[0].values.length;i++){const row={};for(const f of frame.fields)row[f.name]=typeof f.values.get==='function'?f.values.get(i):f.values[i];out.push(row);}return out; }
  function bind(node,handler) { listen(node,'click',handler);listen(node,'keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();handler();}}); }
  function spark(id,data,field) { const values=data.map(x=>x[field]).filter(Number.isFinite);if(!values.length)return;const low=Math.min(...values),span=Math.max(Math.max(...values)-low,.01);el(id).setAttribute('d',values.length===1?'M0 14H200':values.map((v,i)=>`${i?'L':'M'}${(i/(values.length-1)*200).toFixed(1)} ${(23-(v-low)/span*20).toFixed(1)}`).join(' ')); }
  function freshness() { const age=state.meta?Math.max(0,Math.floor((Date.now()-state.meta.sampled_at_ms)/1000)):Infinity;const stale=state.error||age>20;root.classList.toggle('stale',stale);text('freshness',!state.meta?'Waiting for telemetry':state.error?'Query failed · values retained':stale?`Feed stale · ${age}s old`:`Updated ${age}s ago`); }
  function update(panelData) {
    if(state.disposed)return;
    state.error=Boolean(panelData?.error||panelData?.errors?.length);
    const data={};for(const frame of panelData?.series||[])data[frame.refId]=rows(frame);
    const required=htmlGraphics.customProperties.required||['A'];
    if(state.error||required.some(id=>!data[id]?.length)){state.error=state.error||Boolean(state.meta);freshness();return;}
    state.data=data;state.meta=data.A[0];root.classList.remove('waiting');renderer(data);freshness();
  }
  function paused(value) { state.paused=value;root.classList.toggle('paused',value);text('motion',value?'Resume motion':'Pause motion');el('motion').setAttribute('aria-pressed',String(value)); }
  listen(el('motion'),'click',()=>paused(!state.paused));listen(media,'change',event=>paused(event.matches));
  const timer=setInterval(freshness,1000);
  function cleanup(){if(state.disposed)return;state.disposed=true;clearInterval(timer);listeners.forEach(fn=>fn());htmlNode.removeEventListener('panelwillunmount',cleanup);if(htmlNode.__aiCleanup===cleanup)delete htmlNode.__aiCleanup;if(htmlNode.__aiUpdate===update)delete htmlNode.__aiUpdate;}
  htmlNode.__aiCleanup=cleanup;htmlNode.__aiUpdate=update;htmlNode.addEventListener('panelwillunmount',cleanup);
  function fan(parent,x,y,r=21){const group=svg('g',{transform:`translate(${x} ${y})`},parent);svg('circle',{r:r+5,fill:'#111c24',stroke:'#526a77','stroke-width':2,class:'fan-housing'},group);const rotor=svg('g',{class:'rotor'},group);for(let i=0;i<5;i++)svg('path',{d:`M2 -2C${r*.25} ${-r} ${r} ${-r} ${r} -2C${r*.7} 3 ${r*.25} 5 2 -2Z`,fill:'#8cb0b7',transform:`rotate(${i*72})`},rotor);svg('circle',{r:4,fill:'#d9e7df'},group);return group;}
  return {el,root,state,text,num,clamp,listen,svg,label,bind,spark,fan,start(fn){renderer=fn;paused(state.paused);update(htmlGraphics.data);},repaint(){renderer(state.data);freshness();}};
})();
