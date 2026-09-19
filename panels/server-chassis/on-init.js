const {el,svg,label,bind,text,num,fan}=app;
const scene=el('chassisScene'),modules=new Map(),fans=new Map();
let selected='F04';
svg('rect',{x:14,y:10,width:972,height:565,rx:14,class:'board'},scene);
for(let x=32;x<975;x+=65)for(let y=28;y<575;y+=65)svg('circle',{cx:x,cy:y,r:1.2,fill:'#334b55',opacity:.6},scene);
for(let x=100;x<950;x+=135)svg('path',{d:`M${x} 557V420`,class:'flow air'},scene);
function path(d,type='pcie') { const g=svg('g',{class:type==='management'?'management-plane':'data-plane'},scene);svg('path',{d,class:'link-base','stroke-width':4},g);return svg('path',{d,class:'flow '+(type==='pcie'?'':type)},g); }
// Data paths: CPU roots → PCIe switches → GPU endpoints and fabric NICs.
path('M360 280V350');path('M690 280V350');
path('M455 231H595','fabric');label(scene,525,214,'CPU FABRIC','svg-mini','middle');
path('M265 382H221V93H260');path('M785 382H838V93H780');
path('M355 57V24H440','fabric');path('M685 57V24H600','fabric');label(scene,520,30,'CLUSTER FABRIC','svg-mini','middle');
path('M360 412V445H110V487');path('M360 445H440V487');path('M220 445V487');path('M330 445V487');
path('M690 412V445H560V487');path('M690 445H890V487');path('M670 445V487');path('M780 445V487');
// BMC sideband/control plane is deliberately separate from PCIe/fabric data traffic.
path('M184 230H260','management');path('M111 180V141H690V180','management');
path('M111 290V558H909','management');for(const x of [180,324,468,612,756,900])path(`M${x} 558V579`,'management');
label(scene,33,329,'FAN TACH / PWM','svg-mini');
function module(id,x,y,w,h,title,kind){
 const g=svg('g',{class:'selectable',transform:`translate(${x} ${y})`,role:'button',tabindex:0,'aria-label':title,'aria-pressed':'false'},scene);
 svg('rect',{width:w,height:h,rx:6,fill:kind==='bmc'?'#2e2b21':kind==='cpu'?'#203640':kind==='gpu'?'#1b2d36':'#252637',class:'outline'},g);
 svg('circle',{cx:w-12,cy:12,r:3,class:'status-dot pulse'},g);
 const heading=label(g,w/2,kind==='cpu'?35:28,title,'svg-title','middle');
 if(kind==='switch'||kind==='nic')heading.style.fontSize='18px';
 if(kind==='gpu')heading.style.fontSize='20px';
 const value=label(g,w/2,h-17,'Waiting','svg-label','middle');
 if(kind==='gpu'||kind==='bmc')value.style.fontSize='13px';
 if(kind==='cpu'){
  for(let i=0;i<7;i++){svg('path',{d:`M${18+i*24} -5V0M${18+i*24} ${h}V${h+5}`,stroke:'#7d9497','stroke-width':3},g);}
 }
 bind(g,()=>{selected=id;app.repaint();});modules.set(id,{g,value,kind});return g;
}
module('BMC',38,180,146,110,'BMC','bmc');
module('NIC0',260,57,190,72,'FABRIC NIC 0','nic');module('NIC1',590,57,190,72,'FABRIC NIC 1','nic');
module('CPU0',265,180,190,100,'CPU 0','cpu');module('CPU1',595,180,190,100,'CPU 1','cpu');
for(const base of [193,800]){
 for(let i=0;i<4;i++)svg('rect',{x:base+i*13,y:195,width:8,height:70,rx:1,fill:'#39574f',stroke:'#819378','stroke-width':.6},scene);
 label(scene,base+20,292,'DDR','svg-mini','middle');
}
module('PCIE0',265,350,190,62,'PCIe SWITCH 0','switch');module('PCIE1',595,350,190,62,'PCIe SWITCH 1','switch');
for(let i=0;i<8;i++){const x=(i<4?60:510)+(i%4)*110;module('GPU'+i,x,480,100,68,'GPU '+i,'gpu');}
for(let index=1;index<=6;index++){
 const id='F'+String(index).padStart(2,'0'),button=document.createElement('button');button.type='button';button.className='fan-card';button.id='fan-'+id;
 const title=document.createElement('span');title.textContent=id;button.appendChild(title);
 const picture=svg('svg',{viewBox:'0 0 84 84','aria-hidden':'true'});fan(picture,42,42,27);button.appendChild(picture);
 const rpm=document.createElement('strong');rpm.textContent='—';button.appendChild(rpm);const unit=document.createElement('small');unit.textContent='RPM';button.appendChild(unit);const status=document.createElement('i');status.textContent='WAITING';button.appendChild(status);
 app.listen(button,'click',()=>{selected=id;app.repaint();});el('fanWall').appendChild(button);fans.set(id,{button,rpm,status});
}
htmlNode.querySelectorAll('[data-plane]').forEach(button=>app.listen(button,'click',()=>{
 app.root.classList.toggle('plane-management',button.dataset.plane==='management');app.root.classList.toggle('plane-data',button.dataset.plane==='data');htmlNode.querySelectorAll('[data-plane]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
}));
function readouts(values){el('componentMetrics').replaceChildren();for(const [name,value] of values){const row=document.createElement('div'),title=document.createElement('span'),data=document.createElement('strong');title.textContent=name;data.textContent=value;row.append(title,data);el('componentMetrics').appendChild(row);}}
app.start(data=>{
 if(!data.B?.length)return;
 const node=data.E[0],gpus=data.C,fanRows=data.D,components=data.B,history=data.H||[];
 text('gpuCount',node.gpu_count);text('nodePower',num(node.power_kw));text('hotspot',num(node.gpu_temp_c));text('fanCount',`${fanRows.filter(f=>f.rpm>0).length}/6`);
 el('trend0').setAttribute('d','M0 15H200');el('trend3').setAttribute('d','M0 15H200');app.spark('trend1',history,'power_kw');
 for(const component of components){const m=modules.get(component.component_id);m.value.textContent=component.kind==='bmc'?'ONLINE · 1 FAULT':component.kind==='nic'?num(component.throughput_gbps,0)+' Gb/s':component.kind==='cpu'?num(component.util_pct,0)+'% · '+num(component.temp_c,0)+'°C':num(component.util_pct,0)+'% LOAD';m.g.setAttribute('aria-label',`${component.label}, ${m.value.textContent}`);}
 gpus.forEach(gpu=>{const m=modules.get('GPU'+gpu.gpu_index);m.value.textContent=num(gpu.util_pct,0)+'% · '+num(gpu.temp_c,0)+'°C';m.g.classList.toggle('warning',gpu.status==='warm');m.g.setAttribute('aria-label',`GPU ${gpu.gpu_index}, ${num(gpu.util_pct,0)} percent utilization, ${num(gpu.temp_c)} degrees Celsius`);});
 for(const [id,m] of modules){m.g.classList.toggle('selected',selected===id);m.g.setAttribute('aria-pressed',String(selected===id));}
 for(const f of fanRows){const card=fans.get(f.fan_id);card.rpm.textContent=Number.isFinite(f.rpm)?f.rpm.toLocaleString():'—';card.status.textContent=f.status.toUpperCase();card.button.classList.toggle('failed',f.status==='failed');card.button.style.setProperty('--spin',f.rpm>0?`${(3900/f.rpm).toFixed(3)}s`:'0s');card.button.setAttribute('aria-pressed',String(selected===f.fan_id));card.button.setAttribute('aria-label',`${f.fan_id}, ${f.rpm} RPM, ${f.status}`);}
 const f=fanRows.find(f=>f.fan_id===selected),gpu=selected.startsWith('GPU')?gpus.find(g=>g.gpu_index===Number(selected.slice(3))):null,c=components.find(c=>c.component_id===selected);
 if(f){text('componentName','Fan '+f.fan_id);text('componentStatus',f.status.toUpperCase());el('componentStatus').className='pill '+(f.status==='failed'?'failed':'healthy');readouts([['MEASURED TACH',f.rpm.toLocaleString()+' RPM'],['BMC SPEED TARGET',f.target_rpm.toLocaleString()+' RPM'],['BMC', 'ONLINE']]);text('componentDescription',f.status==='failed'?'Injected fan stall: this is a measured synthetic zero, not missing telemetry. Fan F04 has no rotation; the five other modules continue operating.':'The rotor follows the simulated RPM with a visual speed scale. RPM is the numeric tachometer reading; the animation is intentionally slower for legibility.');}
 else if(gpu){text('componentName','GPU '+gpu.gpu_index);text('componentStatus',gpu.status.toUpperCase());el('componentStatus').className='pill '+gpu.status;readouts([['UTILIZATION',num(gpu.util_pct,0)+'%'],['TEMPERATURE',num(gpu.temp_c)+'°C'],['HBM',num(gpu.hbm_used_gb)+' / 80 GB'],['POWER',num(gpu.power_w,0)+' W']]);text('componentDescription','A simulated accelerator endpoint connected through the corresponding PCIe switch. GPU 5 and GPU 6 are warmer in the cooling-fault scenario.');}
 else if(c){text('componentName',c.label);text('componentStatus',c.status.toUpperCase());el('componentStatus').className='pill';const metrics=[['TEMPERATURE',num(c.temp_c)+'°C'],['POWER',num(c.power_w,0)+' W']];if(Number.isFinite(c.util_pct))metrics.push(['UTILIZATION',num(c.util_pct,0)+'%']);if(Number.isFinite(c.throughput_gbps))metrics.push(['TRAFFIC',num(c.throughput_gbps,0)+' Gb/s']);readouts(metrics);text('componentDescription',c.kind==='bmc'?'The management controller reports sensor health and fan tachometers through an illustrative sideband/control plane. It is separate from CPU, PCIe and GPU data traffic.':c.kind==='cpu'?'CPU root complex connects to its PCIe switch; the violet CPU fabric represents the inter-socket connection. DDR banks are illustrative inventory.':c.kind==='nic'?'One of two simulated 200 Gb/s fabric NICs; the pair connects this chassis to the cluster network through PCIe.':'Illustrative PCIe switch routes host traffic to four GPU endpoints and a fabric NIC. This diagram does not specify a vendor motherboard or lane allocation.');}
});
