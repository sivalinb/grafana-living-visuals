// Native HTML Graphics lifecycle. The artwork and fictional samples are bundled.
if (htmlNode.__atlasCleanup) htmlNode.__atlasCleanup();
const $ = id => htmlNode.getElementById(id);
const root = htmlNode.querySelector('.atlas');
const workouts = htmlGraphics.customProperties.workouts;
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const state = {workout:0, time:0, playing:true, reduced:motionPreference.matches, speed:30, gap:false};
let disposed = false;
let raf = 0;
let last = 0;
let lastPaint = 0;
const listeners = [];
function listen(target, name, fn) { target.addEventListener(name,fn); listeners.push(() => target.removeEventListener(name,fn)); }
function clock(seconds) { const s=Math.max(0,Math.floor(seconds||0)); return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`; }
function sampleAt(samples, second, maxAge=30) {
  let lo=0, hi=samples.length-1, found=-1;
  while(lo<=hi) { const mid=(lo+hi)>>1; if(samples[mid].t<=second) { found=mid;lo=mid+1; } else hi=mid-1; }
  const sample=found>=0?samples[found]:null;
  return sample && second-sample.t<=maxAge && Number.isFinite(sample.bpm) && sample.bpm>0 ? sample:null;
}
// Same two-part pulse as Living Atlas / dist/core.js.
function beatScale(bpm, time, enabled) {
  if(!enabled || !Number.isFinite(bpm) || bpm<=0) return 1;
  const p=(time*bpm/60)%1;
  return 1+.045*Math.exp(-(((p-.12)/.07)**2))+.019*Math.exp(-(((p-.32)/.08)**2));
}
function currentSample() { return state.gap?null:sampleAt(workouts[state.workout].hr,state.time); }
function setPlaying(playing) { state.playing=playing; $('play').textContent=playing?'Ⅱ':'▶'; $('play').setAttribute('aria-label',playing?'Pause replay':'Play replay'); }
function setReduced(reduced) { state.reduced=reduced; root.classList.toggle('reduced',reduced); $('motion').setAttribute('aria-pressed',String(reduced)); $('motion').textContent=reduced?'Motion reduced':'Reduce motion'; }
function update() {
  const workout=workouts[state.workout], sample=currentSample();
  $('bpm').textContent=sample?Math.round(sample.bpm):'—';
  $('signal').textContent=sample?'Signal available':'No recent sample';
  $('age').textContent=sample?`${Math.round(state.time-sample.t)}s since sample`:'No rate is invented';
  root.classList.toggle('dimmed',!sample);
  $('clock').textContent=clock(state.time);
  $('seek').value=String(state.time);
  $('total').textContent='/ '+clock(workout.duration);
  $('duration').textContent=clock(workout.duration);
  $('distance').textContent=Number.isFinite(workout.distance)?`${workout.distance.toFixed(1)} km`:'—';
}
workouts.forEach((w,i) => {
  const option=document.createElement('option'); option.value=String(i); option.textContent=`${w.date} · ${w.activity} · ${w.distance.toFixed(1)} km`; $('workout').appendChild(option);
});
$('seek').max=String(workouts[0].duration);
listen($('workout'),'change',event => { state.workout=Number(event.target.value); state.time=0; state.gap=false; $('gap').checked=false; $('seek').max=String(workouts[state.workout].duration); update(); });
listen($('play'),'click',() => setPlaying(!state.playing));
listen($('seek'),'input',event => { state.time=Number(event.target.value); update(); });
listen($('speed'),'change',event => { state.speed=Number(event.target.value); });
listen($('motion'),'click',() => setReduced(!state.reduced));
listen($('gap'),'change',event => { state.gap=event.target.checked; update(); });
listen(motionPreference,'change',event => setReduced(event.matches));
listen(document,'visibilitychange',() => { last=0; });
function tick(t) {
  if(disposed) return;
  const dt=last?Math.min((t-last)/1000,.2):0; last=t;
  if(state.playing) {
    state.time+=dt*state.speed;
    if(state.time>workouts[state.workout].duration) state.time=0;
  }
  if(t-lastPaint>100) { update(); lastPaint=t; }
  $('heart').style.transform=`translate(-50%,-50%) scale(${beatScale(currentSample()?.bpm,t/1000,state.playing&&!state.reduced)})`;
  raf=requestAnimationFrame(tick);
}
function cleanup() {
  if(disposed) return; disposed=true; cancelAnimationFrame(raf); listeners.forEach(remove => remove());
  htmlNode.removeEventListener('panelwillunmount',cleanup);
  if(htmlNode.__atlasCleanup===cleanup) delete htmlNode.__atlasCleanup;
}
htmlNode.__atlasCleanup=cleanup;
htmlNode.addEventListener('panelwillunmount',cleanup);
setReduced(state.reduced); setPlaying(true); update(); raf=requestAnimationFrame(tick);
