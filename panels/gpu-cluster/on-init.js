const {el,svg,label,bind,text,num,clamp}=app;
const scene=el('clusterScene'),racks=new Map(),links=new Map(),nodeCards=[];
let selectedRack='AI-R01',selectedNode='AI-R01-N03';
for(const [name,x] of [['SPINE-A',205],['SPINE-B',665]]){
 svg('rect',{x,y:32,width:250,height:74,rx:7,fill:'#252638',stroke:'#75698e','stroke-width':2},scene);
 label(scene,x+125,64,name.replace('-',' '),'svg-title','middle');label(scene,x+125,89,'COLLECTIVE FABRIC','svg-mini','middle');
 for(let i=0;i<12;i++)svg('circle',{cx:x+27+i*18,cy:43,r:2,fill:'#b5a0ff',class:'signal',style:`animation-delay:-${i*.12}s`},scene);
}
for(let r=0;r<4;r++){
 const id=`AI-R0${r+1}`,x=35+r*275,cx=x+112;
 for(let s=0;s<2;s++){
  const from=s?790:330,level=133+s*30+r*6,end=cx+(s?25:-25),path=`M${from} 106V${level}Q${from} ${level+9} ${from+(end>from?12:-12)} ${level+9}H${end}V233`;
  svg('path',{d:path,class:'link-base'},scene);const line=svg('path',{d:path,class:'flow fabric',style:`animation-delay:-${r*.3+s*.7}s`},scene);links.set(`${id}:SPINE-${s?'B':'A'}`,line);
 }
 const g=svg('g',{class:'selectable',role:'button',tabindex:0,'aria-label':`Rack ${id}`,'aria-pressed':String(id===selectedRack)},scene);
 svg('rect',{x,y:231,width:225,height:338,rx:8,fill:'#171e2c',class:'outline'},g);
 label(g,x+17,265,id,'svg-title');const dot=svg('circle',{cx:x+203,cy:258,r:5,class:'status-dot'},g);
 label(g,x+17,289,'8 NODES / 64 GPUs','svg-mini');
 const matrix=[];for(let n=0;n<8;n++)for(let k=0;k<8;k++)matrix.push(svg('rect',{x:x+18+k*24,y:307+n*22,width:17,height:15,rx:2,fill:'#b5a0ff'},g));
 const util=label(g,x+17,524,'—%','svg-value');label(g,x+99,521,'GPU UTIL','svg-mini');const power=label(g,x+17,550,'— kW','svg-label');
 bind(g,()=>{selectedRack=id;selectedNode=id+'-N03';app.repaint();});racks.set(id,{g,matrix,util,power,dot});
}
label(scene,560,603,'4 × 64 GPUs · TWO 1.6 Tb/s UPLINKS PER RACK','svg-label','middle');
for(let i=0;i<8;i++){
 const b=document.createElement('button');b.type='button';b.className='node-card';b.innerHTML='<span></span><strong>—</strong><small></small>';
 app.listen(b,'click',()=>{selectedNode=`${selectedRack}-N${String(i+1).padStart(2,'0')}`;app.repaint();});el('clusterNodes').appendChild(b);nodeCards.push(b);
}
for(const id of ['aurora-train','atlas-serve']){const card=document.createElement('div');card.className='job';card.id='job-'+id;card.innerHTML='<span class="eyebrow"></span><h3></h3><strong></strong><p></p><div class="bar"><i></i></div>';el('jobs').appendChild(card);}
app.start(data=>{
 if(!data.B?.length)return;
 const meta=data.A[0],history=data.H||[];
 text('gpuCount',meta.gpu_count);text('gpuUtil',num(meta.gpu_util_pct,0));text('clusterPower',num(meta.power_kw));text('traffic',num(meta.network_gbps/1000,2));
 el('trend0').setAttribute('d','M0 15H200');app.spark('trend1',history,'gpu_util_pct');app.spark('trend2',history,'power_kw');app.spark('trend3',history,'network_gbps');
 for(const rack of data.B){const g=racks.get(rack.rack_id);g.g.classList.toggle('selected',rack.rack_id===selectedRack);g.g.classList.toggle('degraded',rack.status==='degraded');g.g.setAttribute('aria-pressed',String(rack.rack_id===selectedRack));g.g.setAttribute('aria-label',`${rack.rack_id}, 64 GPUs, ${num(rack.gpu_util_pct,0)} percent utilization, ${num(rack.power_kw)} kilowatts`);g.util.textContent=num(rack.gpu_util_pct,0)+'%';g.power.textContent=num(rack.power_kw)+' kW';data.D.filter(gpu=>gpu.rack_id===rack.rack_id).forEach((gpu,i)=>{g.matrix[i].setAttribute('fill',gpu.status==='warm'?'#ecc78d':'#b5a0ff');g.matrix[i].setAttribute('opacity',String(.16+gpu.util_pct/120));});}
 for(const l of data.E){const path=links.get(l.link_id);path.style.setProperty('--flow-speed',`${3.5-clamp(l.util_pct)/40}s`);path.style.opacity=l.rack_id===selectedRack?'.95':'.4';let title=path.querySelector('title');if(!title)title=svg('title',{},path);title.textContent=`${l.link_id}: ${num(l.throughput_gbps,0)} / 1600 Gb/s · ${num(l.latency_us,2)} μs`;}
 const rack=data.B.find(r=>r.rack_id===selectedRack),nodes=data.C.filter(n=>n.rack_id===selectedRack),uplinks=data.E.filter(l=>l.rack_id===selectedRack);
 text('clusterRackName',selectedRack);text('clusterRackStatus',rack.status==='degraded'?'COOLING FAULT / N03':'HEALTHY');el('clusterRackStatus').className='pill '+rack.status;
 text('clusterRackSummary',`64 GPUs · ${num(rack.power_kw)} kW · ${num(rack.network_gbps/1000,2)} Tb/s endpoint traffic · spine A/B ${uplinks.map(l=>num(l.util_pct,0)+'%').join(' / ')} utilization`);
 nodes.forEach((n,i)=>{const b=nodeCards[i];b.querySelector('span').textContent=n.node_id.split('-').at(-1)+(n.status==='degraded'?' · FAN FAULT':'');b.querySelector('strong').textContent=num(n.gpu_util_pct,0)+'%';b.querySelector('small').textContent=`${num(n.power_kw)} kW · 8 GPUs`;b.classList.toggle('degraded',n.status==='degraded');b.setAttribute('aria-pressed',String(n.node_id===selectedNode));b.setAttribute('aria-label',`${n.node_id}, ${num(n.gpu_util_pct,0)} percent GPU utilization${n.status==='degraded'?', cooling fault':''}`);});
 const node=nodes.find(n=>n.node_id===selectedNode)||nodes[0];text('clusterNodeDetail',`${node.node_id} · HBM ${num(node.hbm_used_gb,0)} / 640 GB · max GPU ${num(node.gpu_temp_c)}°C · ${node.fan_ok}/6 fans · ${node.job_id==='aurora-train'?'Aurora training':'Atlas inference'}`);
 for(const job of data.F){const card=el('job-'+job.job_id);card.querySelector('.eyebrow').textContent=`${job.allocated_gpus} GPUs · ${job.status.toUpperCase()}`;card.querySelector('h3').textContent=job.label;card.querySelector('strong').textContent=num(job.tokens_per_s/1000,1)+'k tokens/s';card.querySelector('p').textContent=job.kind==='training'?`${num(job.progress_pct)}% through the simulated training cycle`:'Continuous simulated inference traffic';card.querySelector('.bar i').style.width=(job.kind==='training'?job.progress_pct:100)+'%';}
});
