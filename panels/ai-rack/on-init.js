const {el,svg,label,fan,bind,text,num,clamp,state}=app;
const scene=el('rackScene'),serverGroups=new Map(),tiles=[];
let selected='AI-R01-N03',selectedGPU=6;
svg('ellipse',{cx:300,cy:821,rx:245,ry:32,fill:'#5ad2c4',opacity:.06},scene);
svg('path',{d:'M80 80L113 49H543L510 80Z',class:'hardware-top'},scene);
svg('path',{d:'M510 80L543 49V771L510 805Z',fill:'#0b1118',stroke:'#354b58'},scene);
svg('rect',{x:80,y:80,width:430,height:725,rx:8,fill:'#0b141c',stroke:'#54707c','stroke-width':2},scene);
svg('path',{d:'M94 97V785M496 97V785',stroke:'#526b77','stroke-width':4},scene);
svg('path',{d:'M62 174V762M528 174V762',class:'flow power','stroke-width':4},scene);
label(scene,60,124,'A','svg-label','middle');label(scene,530,124,'B','svg-label','middle');
label(scene,298,37,'AI–R01 / 42U','svg-title','middle');
for(let row=0;row<2;row++){
 const y=100+row*38;
 svg('rect',{x:110,y,width:370,height:30,rx:2,class:'hardware'},scene);
 label(scene,123,y+20,row?'FABRIC B':'FABRIC A','svg-mini');
 for(let i=0;i<16;i++)svg('rect',{x:245+i*13,y:y+10,width:8,height:8,rx:1,fill:'#b5a0ff',class:'signal',style:`animation-delay:-${i*.13}s`},scene);
}
for(let slot=1;slot<=8;slot++){
 const id=`AI-R01-N${String(slot).padStart(2,'0')}`,y=191+(slot-1)*72;
 const g=svg('g',{class:'selectable server',role:'button',tabindex:0,'aria-label':`Server N${String(slot).padStart(2,'0')}, waiting for telemetry`,'aria-pressed':String(id===selected)},scene);
 svg('rect',{x:107,y,width:378,height:64,rx:3,fill:'#192c37',class:'outline'},g);
 label(g,121,y+28,`N${String(slot).padStart(2,'0')}`,'svg-title');
 label(g,122,y+48,'8 GPU','svg-mini');
 const chips=[];for(let i=0;i<8;i++){
  svg('rect',{x:188+i*29,y:y+13,width:23,height:23,rx:2,fill:'#0a1921',stroke:'#526e74'},g);
  chips.push(svg('rect',{x:193+i*29,y:y+18,width:13,height:13,rx:1,fill:'#84ddca',class:'signal',style:`animation-delay:-${(slot+i)*.11}s`},g));
 }
 const value=label(g,188,y+54,'— GPU utilization','svg-mini');
 const rotor=fan(g,454,y+31,16);rotor.style.setProperty('--spin',`${.65+slot*.04}s`);
 const dot=svg('circle',{cx:472,cy:y+11,r:3.5,class:'status-dot'},g);
 label(scene,67,y+38,`${40-slot*4}U`,'svg-mini','end');
 bind(g,()=>{selected=id;selectedGPU=6;app.repaint();});
 serverGroups.set(id,{g,chips,value,dot});
}
svg('path',{d:'M124 784H467',stroke:'#46606c','stroke-width':3,'stroke-dasharray':'2 6'},scene);
label(scene,295,853,'DUAL POWER · 80 kW DESIGN CAPACITY','svg-label','middle');
for(let index=0;index<8;index++){
 const button=document.createElement('button');button.className='gpu-tile';button.type='button';button.innerHTML=`<span>GPU ${index}</span><strong>—</strong><small>— °C</small>`;
 app.listen(button,'click',()=>{selectedGPU=index;app.repaint();});el('gpuTiles').appendChild(button);tiles.push(button);
}
app.start(data=>{
 if(!data.C?.length)return;
 const rack=data.B[0],nodes=data.C,gpus=data.D,history=data.H||[];
 text('gpuCount',rack.gpu_count);text('rackPower',num(rack.power_kw));text('gpuUtil',num(rack.gpu_util_pct,0));text('fanCount',`${nodes.reduce((s,n)=>s+n.fan_ok,0)}/${nodes.reduce((s,n)=>s+n.fan_total,0)}`);
 el('trend0').setAttribute('d','M0 15H200');el('trend3').setAttribute('d','M0 15H200');app.spark('trend1',history,'power_kw');app.spark('trend2',history,'gpu_util_pct');
 for(const node of nodes){const item=serverGroups.get(node.node_id);if(!item)continue;const active=node.node_id===selected;item.g.classList.toggle('selected',active);item.g.classList.toggle('degraded',node.status==='degraded');item.g.setAttribute('aria-pressed',String(active));item.g.setAttribute('aria-label',`${node.node_id}, GPU ${num(node.gpu_util_pct,0)} percent, ${num(node.power_kw)} kilowatts, ${node.fan_ok} of ${node.fan_total} fans running`);item.value.textContent=`${num(node.gpu_util_pct,0)}% GPU · ${num(node.power_kw)} kW`;item.g.style.setProperty('--activity',`${2.3-clamp(node.gpu_util_pct)/70}s`);const nodeGPUs=gpus.filter(g=>g.node_id===node.node_id);nodeGPUs.forEach((g,i)=>{item.chips[i].setAttribute('fill',g.status==='warm'?'#ecc78d':'#84ddca');item.chips[i].style.opacity=String(.35+g.util_pct/150);});}
 const node=nodes.find(n=>n.node_id===selected)||nodes[0],ng=gpus.filter(g=>g.node_id===node.node_id);
 text('nodeName',node.node_id.split('-').at(-1));text('nodeSubtitle',`${node.node_id} · ${node.job_id==='aurora-train'?'Aurora distributed training':'Atlas inference'}`);
 text('nodeStatus',node.status==='degraded'?'COOLING DEGRADED':'HEALTHY');el('nodeStatus').className='pill '+node.status;
 text('nodePower',num(node.power_kw)+' kW');text('nodeCompute',`${num(node.gpu_util_pct,0)}% / ${num(node.cpu_util_pct,0)}%`);text('nodeMemory',num(node.hbm_used_gb,0)+' / 640 GB');text('nodeNetwork',num(node.network_gbps));text('nodeFans',`${node.fan_ok}/${node.fan_total} fans`);
 ng.forEach((g,i)=>{const tile=tiles[i];tile.classList.toggle('warm',g.status==='warm');tile.setAttribute('aria-pressed',String(g.gpu_index===selectedGPU));tile.setAttribute('aria-label',`GPU ${i}, ${num(g.util_pct,0)} percent utilization, ${num(g.temp_c)} degrees Celsius`);tile.querySelector('strong').textContent=num(g.util_pct,0)+'%';tile.querySelector('small').textContent=num(g.temp_c)+'°C';});
 const gpu=ng.find(g=>g.gpu_index===selectedGPU)||ng[0];text('gpuDetail',`GPU ${gpu.gpu_index} · HBM ${num(gpu.hbm_used_gb)} / 80 GB · ${num(gpu.power_w,0)} W · local fabric ${num(gpu.fabric_gbps,0)} Gb/s`);
 text('nodeNotice',node.status==='degraded'?'One cooling module is stalled: fan F04 in this server reports 0 RPM. All eight GPUs remain available in the simulation.':'All eight GPUs are available. The server has six reporting fans and no injected cooling fault.');el('nodeNotice').className='notice'+(node.status==='degraded'?' failed':'');
});
