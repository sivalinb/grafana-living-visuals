if (htmlNode.__dcCleanup) htmlNode.__dcCleanup();
const $ = id => htmlNode.getElementById(id);
const root = htmlNode.querySelector('.dc');
const ns = 'http://www.w3.org/2000/svg';
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const state = { racks:new Map(), hall:null, mode:'temperature', selected:'B04', paused:motionPreference.matches, error:false };
const groups = new Map();
const listeners = [];
let disposed=false;
const palette = {healthy:'#78d8cf',warning:'#efbd78',critical:'#f18778',offline:'#69808c'};
const labels = {healthy:'Normal',warning:'Warning',critical:'Critical',offline:'No signal'};
function listen(target,type,fn) { target.addEventListener(type,fn); listeners.push(() => target.removeEventListener(type,fn)); }
function svg(name,attrs) { const el=document.createElementNS(ns,name); Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k,String(v))); return el; }
function text(id,value) { $(id).textContent=value; }
function number(value,digits=1) { return Number.isFinite(value)?value.toFixed(digits):'—'; }
function percent(value) { return Number.isFinite(value)?Math.max(0,Math.min(100,value)):0; }
function ageString(ms) { const sec=Math.max(0,Math.floor(ms/1000)); return sec<60?`${sec}s`:`${Math.floor(sec/60)}m ${sec%60}s`; }
function rackStatus(r) { return !r || r.status==='offline' || Date.now()-r.last_seen_ms>30000 ? 'offline' : r.status; }
function frameRows(frame) {
  if(!frame?.fields?.length) return [];
  const rows=[];
  for(let i=0;i<frame.fields[0].values.length;i++) {
    const row={};
    frame.fields.forEach(field => { const values=field.values; row[field.name]=typeof values.get==='function'?values.get(i):values[i]; });
    rows.push(row);
  }
  return rows;
}
function colorMix(a,b,t) {
  const aa=a.match(/\w\w/g).map(x=>parseInt(x,16)), bb=b.match(/\w\w/g).map(x=>parseInt(x,16));
  return '#'+aa.map((x,i)=>Math.round(x+(bb[i]-x)*Math.max(0,Math.min(1,t))).toString(16).padStart(2,'0')).join('');
}
function metricColor(r) {
  if(rackStatus(r)==='offline') return palette.offline;
  const value=state.mode==='temperature'?(r.inlet_c-22)/12:state.mode==='power'?r.power_kw/r.capacity_kw:r.cpu_pct/100;
  if(value<.55) return colorMix('659cbc','78d8cf',value/.55);
  if(value<.8) return colorMix('78d8cf','efbd78',(value-.55)/.25);
  return colorMix('efbd78','f18778',(value-.8)/.2);
}
function selectRack(id,reveal=false) {
  state.selected=id;
  groups.forEach((g,key) => { g.classList.toggle('selected',key===id); g.setAttribute('aria-pressed',String(key===id)); });
  updateInspector();
  if(reveal&&root.clientWidth<=900) htmlNode.querySelector('.inspector').scrollIntoView({behavior:state.paused?'auto':'smooth',block:'nearest'});
}
for(let col=0;col<=12;col++) {
  const x=190+col*75;
  $('floorLines').appendChild(svg('path',{d:`M${x} 24L${x-151} 590`}));
}
for(let row=0;row<=8;row++) {
  const y=24+row*70.75, x=190-row*18.875;
  $('floorLines').appendChild(svg('path',{d:`M${x} ${y}H${x+900}`}));
}
for(let row=0;row<4;row++) {
  const x=240-row*42,y=66+row*130,letter=String.fromCharCode(65+row);
  const label=svg('text',{x:x-62,y:y+43,class:'row-label'});label.textContent=letter;$('coolingLanes').appendChild(label);
  $('coolingLanes').appendChild(svg('path',{d:`M${x-15} ${y-23}H${x+806}`,class:'lane',style:`animation-delay:-${row*.6}s`}));
  for(let col=0;col<6;col++) {
    const id=`${letter}${String(col+1).padStart(2,'0')}`;
    const g=svg('g',{id:'rack-'+id,class:'rack offline',transform:`translate(${x+col*140} ${y})`,role:'button',tabindex:0,'aria-label':`Rack ${id}, waiting for telemetry`,'aria-pressed':'false'});
    let slots='';
    for(let k=0;k<5;k++) {
      const sy=16+k*11;
      slots+=`<rect class="slot" x="8" y="${sy}" width="72" height="9" rx="1"/><path class="slot-line" d="M15 ${sy+3}H50M15 ${sy+6}H44"/><circle class="led" cx="67" cy="${sy+4.5}" r="2" style="animation-delay:-${(row*6+col+k)*.13}s"/><circle class="led" cx="74" cy="${sy+4.5}" r="1.4" style="animation-delay:-${(col+k)*.19}s"/>`;
    }
    g.innerHTML=`<title>Rack ${id}</title><ellipse class="heat" cx="50" cy="84" rx="66" ry="17"/><path class="top" d="M0 0L16 -12H104L88 0Z"/><path class="side" d="M88 0L104 -12V66L88 78Z"/><rect class="cabinet" width="88" height="78" rx="2"/><path class="rack-rail" d="M2 4V74"/><circle class="indicator" cx="74" cy="8" r="3"/>${slots}<path class="slot-line" d="M12 73H75"/><text class="rack-id" x="44" y="97" text-anchor="middle">${id}</text><text class="rack-value" x="44" y="114" text-anchor="middle">—</text>`;
    listen(g,'click',()=>selectRack(id,true));
    listen(g,'keydown',event=>{ if(event.key==='Enter'||event.key===' ') { event.preventDefault();selectRack(id,true); } });
    $('racks').appendChild(g);groups.set(id,g);
  }
}
function paintRacks() {
  groups.forEach((g,id) => {
    const r=state.racks.get(id),status=rackStatus(r);
    g.classList.toggle('offline',status==='offline');
    g.classList.toggle('selected',id===state.selected);
    g.setAttribute('aria-pressed',String(id===state.selected));
    const value=!r||status==='offline'?'—':state.mode==='temperature'?`${number(r.inlet_c)}°`:state.mode==='power'?`${number(r.power_kw)} kW`:`${number(r.cpu_pct,0)}%`;
    g.querySelector('.rack-value').textContent=value;
    g.style.setProperty('--accent',r?metricColor(r):palette.offline);
    g.style.setProperty('--health',palette[status]||palette.offline);
    g.style.setProperty('--activity',`${2.8-percent(r?.cpu_pct)/100*2.2}s`);
    g.style.setProperty('--depth',String(status==='offline'?.06:.12+percent(r?.cpu_pct)/100*.17));
    const description=`Rack ${id}, ${labels[status]||'No signal'}${r&&status!=='offline'?`, inlet ${number(r.inlet_c)} degrees Celsius, power ${number(r.power_kw)} kilowatts, CPU ${number(r.cpu_pct,0)} percent`:''}`;
    g.setAttribute('aria-label',description);g.querySelector('title').textContent=description;
  });
  text('scaleLabel',state.mode==='temperature'?'Inlet: 22 → 34°C':state.mode==='power'?'Power: 0 → 10 kW':'CPU: 0 → 100%');
}
function updateInspector() {
  const r=state.racks.get(state.selected),status=rackStatus(r);
  text('rackName',state.selected);text('rackLocation',`Row ${state.selected[0]} · Data Hall 01`);
  text('rackStatus',state.hall?labels[status]:'Waiting');$('rackStatus').className='status-pill '+status;
  const valid=r&&status!=='offline';
  text('rackPower',valid?number(r.power_kw)+' kW':'—');text('rackCapacity',`of ${number(r?.capacity_kw||10)} kW capacity`);
  text('rackThermal',valid?`${number(r.inlet_c)} / ${number(r.outlet_c)}`:'— / —');
  text('rackCompute',valid?`${number(r.cpu_pct,0)} / ${number(r.memory_pct,0)}`:'— / —');
  text('rackNetwork',valid?number(r.network_gbps):'—');
  $('powerBar').style.width=(valid?percent(r.power_kw/r.capacity_kw*100):0)+'%';
  $('cpuBar').style.width=(valid?percent(r.cpu_pct):0)+'%';
  text('servers',r?`${r.servers} servers`:'— servers');text('occupied',r?`${r.occupied_u} / ${r.total_u}U occupied`:'— / 42U occupied');text('fans',valid?`Fans ${Math.round(r.fan_rpm).toLocaleString()} RPM`:'Fans — RPM');
  const message=!r?'Waiting for telemetry.':status==='offline'?'Telemetry is unavailable. Activity lights stop and sensor values remain empty.':status==='critical'?'Simulated hotspot: inlet exceeds the 32°C critical threshold. Inspect cooling and airflow.':status==='warning'?'Simulated warm inlet: above the 28°C warning threshold. Watch this rack’s thermal trend.':'All reporting metrics are within this demonstration’s operating bands.';
  text('rackMessage',message);$('rackMessage').className='rack-message '+status;
  updateFreshness();
}
function updateFreshness() {
  const age=state.hall?Date.now()-state.hall.sampled_at_ms:Infinity;
  const stale=state.error||age>20000;
  root.classList.toggle('stale',stale);
  $('freshness').replaceChildren();const dot=document.createElement('i');$('freshness').appendChild(dot);
  $('freshness').appendChild(document.createTextNode(!state.hall?'Waiting for telemetry':state.error?'Telemetry query failed':stale?`Feed stale · ${ageString(age)} old`:`Updated ${ageString(age)} ago`));
  const r=state.racks.get(state.selected);
  text('rackAge',r?`Last rack sample ${ageString(Date.now()-r.last_seen_ms)} ago`:'Waiting for a sample');
}
function spark(id,rows,field) {
  const vals=rows.map(row=>row[field]).filter(Number.isFinite);
  if(!vals.length) { $(id).setAttribute('d','');return; }
  const min=Math.min(...vals),max=Math.max(...vals),span=Math.max(max-min,.01);
  $(id).setAttribute('d',vals.length===1?'M0 14H220':vals.map((v,i)=>`${i?'L':'M'}${(i/(vals.length-1)*220).toFixed(1)} ${(24-(v-min)/span*20).toFixed(1)}`).join(' '));
}
function updateFromData(panelData) {
  if(disposed) return;
  state.error=Boolean(panelData?.error || panelData?.errors?.length);
  const series=panelData?.series||[];
  const rackRows=frameRows(series.find(frame=>frame.refId==='A'));
  const hallRows=frameRows(series.find(frame=>frame.refId==='B'));
  const history=frameRows(series.find(frame=>frame.refId==='C'));
  if(!hallRows.length||!rackRows.length) { state.error=Boolean(state.hall)||state.error;updateFreshness();return; }
  state.racks=new Map(rackRows.map(row=>[row.rack_id,row]));state.hall=hallRows[0];
  root.classList.remove('waiting');const h=state.hall;
  text('itPower',number(h.it_power_kw));text('facility',`Facility power ${number(h.facility_power_kw)} kW`);
  text('inlet',number(h.avg_inlet_c));text('hotspot',`Hottest rack ${number(h.max_inlet_c)}°C`);
  text('pue',number(h.pue,2));text('network',number(h.network_gbps,0));
  text('reporting',`${h.reporting} / ${h.rack_count} racks reporting`);
  text('cpuHall',`CPU ${number(h.avg_cpu_pct,0)}%`);text('humidity',`Humidity ${number(h.humidity_pct)}%`);text('cooling',`Cooling ${number(h.cooling_kw)} kW`);
  root.style.setProperty('--air-speed',`${Math.max(1,5-h.cooling_kw/10)}s`);
  spark('powerTrend',history,'it_power_kw');spark('inletTrend',history,'avg_inlet_c');spark('pueTrend',history,'pue');spark('networkTrend',history,'network_gbps');
  $('alerts').replaceChildren();
  rackRows.filter(r=>rackStatus(r)!=='healthy').sort((a,b)=>['critical','warning','offline'].indexOf(rackStatus(a))-['critical','warning','offline'].indexOf(rackStatus(b))).forEach(r=>{
    const status=rackStatus(r),b=document.createElement('button');b.type='button';b.className=status;
    b.textContent=status==='offline'?`${r.rack_id} · No telemetry`:`${r.rack_id} · ${number(r.inlet_c)}°C ${labels[status].toLowerCase()}`;
    b.onclick=()=>selectRack(r.rack_id,true);$('alerts').appendChild(b);
  });
  if(!$('alerts').childElementCount) text('alerts','All reporting racks are within demo thresholds.');
  paintRacks();updateInspector();
}
function setPaused(paused) { state.paused=paused;root.classList.toggle('paused',paused);$('motion').textContent=paused?'Resume motion':'Pause motion';$('motion').setAttribute('aria-pressed',String(paused)); }
listen($('motion'),'click',()=>setPaused(!state.paused));
listen(motionPreference,'change',event=>setPaused(event.matches));
htmlNode.querySelectorAll('[data-mode]').forEach(button=>listen(button,'click',()=>{
  state.mode=button.dataset.mode;
  htmlNode.querySelectorAll('[data-mode]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
  paintRacks();
}));
const clock=setInterval(updateFreshness,1000);
function cleanup() {
  if(disposed) return;disposed=true;clearInterval(clock);listeners.forEach(remove=>remove());
  htmlNode.removeEventListener('panelwillunmount',cleanup);
  if(htmlNode.__dcCleanup===cleanup) delete htmlNode.__dcCleanup;
  if(htmlNode.__dcUpdate===updateFromData) delete htmlNode.__dcUpdate;
}
htmlNode.__dcCleanup=cleanup;htmlNode.__dcUpdate=updateFromData;
htmlNode.addEventListener('panelwillunmount',cleanup);
setPaused(state.paused);selectRack(state.selected);updateFromData(htmlGraphics.data);
