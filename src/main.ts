import './style.css';
import {bikes,stages,Mode,stageFor,riders} from './data';
import {Input,newRide,RiderState,tick} from './physics';
import {Renderer} from './renderer';
import {Terrain} from './terrain';
import {loadSave,saveGame,SaveData} from './save';
import {UI,UIState,Screen} from './ui';
const canvas=document.querySelector<HTMLCanvasElement>('#game')!,overlay=document.querySelector<HTMLElement>('#overlay')!,hud=document.querySelector<HTMLElement>('#hud')!,touch=document.querySelector<HTMLElement>('#touch-controls')!;
const renderer=new Renderer(canvas);let save:SaveData=loadSave(),mode:Mode='freestyle',stageIndex=0,screen:Screen='home',ride:RiderState=newRide(),terrain=new Terrain(21,5000,'freestyle'),last=performance.now(),acc=0,hudTimer=0;
const keys=new Set<string>();let paused=false;let touchState={throttle:0,brake:0,left:0,right:0,trick:0};let resultSnapshot:UIState['result'];
const ui=new UI(overlay,hud,touch,(a,v)=>action(a,v));
const uiState=():UIState=>({screen,mode,stageIndex,save,result:resultSnapshot});
const selectedBike=()=>bikes.find(b=>b.id===save.bike)||bikes[0],selectedRider=()=>riders.find(r=>r.id===save.rider)||riders[0];
function draw(){ui.draw(uiState());}
function drawHud(){ui.drawHud(uiState(),ride.time,ride.distance,ride.score,ride.combo,ride.crashes,ride.speed,ride.distance/stageFor(mode,stageIndex).distance*100);}
function startRace(){const st=stageFor(mode,stageIndex);terrain=new Terrain(st.seed,st.distance*4+1000,mode);ride=newRide();ride.x=100;ride.y=terrain.sample(100).y-32;screen='playing';paused=false;last=performance.now();acc=0;overlay.innerHTML='';overlay.style.pointerEvents='none';hud.style.display='block';drawHud();}
function endRace(){
 const st=stageFor(mode,stageIndex);let medal=0;
 if(mode==='freestyle'){const bronze=450*st.difficulty,silver=850*st.difficulty,gold=1350*st.difficulty;medal=ride.score>=gold?3:ride.score>=silver?2:ride.score>=bronze?1:0;}
 else if(mode==='survival')medal=ride.crashes<=1?3:ride.crashes<=3?2:ride.crashes<=6?1:0;
 else medal=ride.time<=st.gold?3:ride.time<=st.silver?2:ride.time<=st.bronze?1:0;
 const prior=save.records[st.id]||{bestTime:Infinity,bestScore:0,medal:0,clears:0};
 save.records[st.id]={bestTime:Math.min(prior.bestTime,ride.time),bestScore:Math.max(prior.bestScore,ride.score),medal:Math.max(prior.medal,medal),clears:prior.clears+1};
 save.coins+=st.reward+Math.round(ride.score*.04)+medal*100;saveGame(save);resultSnapshot={time:ride.time,score:ride.score,crashes:ride.crashes,distance:ride.distance};screen='result';overlay.style.pointerEvents='auto';hud.style.display='none';ui.draw(uiState());
}
function action(a:string,v?:string){
 if(a==='home'){screen='home';paused=false;}
 if(a==='modes')screen='modes';
 if(a==='mode'&&v){mode=v as Mode;stageIndex=0;screen='stages';}
 if(a==='select-stage'&&v!==undefined){const i=Number(v),list=stages.filter(x=>x.mode===mode);if(i===0||!!save.records[list[i-1]?.id]?.clears)stageIndex=i;draw();return;}
 if(a==='start-ride')startRace();
 if(a==='garage')screen='garage';
 if(a==='rider'&&v){save.rider=v;saveGame(save);}
 if(a==='bike'&&v){const bike=bikes.find(b=>b.id===v);if(bike){if(!save.ownedBikes.includes(v)){if(save.coins>=bike.price){save.coins-=bike.price;save.ownedBikes.push(v);}else return;}save.bike=v;saveGame(save);}}
 if(a==='pause'){paused=true;screen='pause';overlay.style.pointerEvents='auto';overlay.innerHTML='<section class="screen result-screen"><div class="result-card"><div class="eyebrow orange">RACE PAUSED</div><h2>TAKE A BREATHER</h2><p>GAS, LEAN AND TRICK. BACK TO IT.</p><div class="result-actions"><button class="btn ghost" data-action="quit">QUIT</button><button class="btn primary" data-action="resume">RESUME →</button></div></div></section>';hud.style.display='none';return;}
 if(a==='resume'){paused=false;screen='playing';last=performance.now();overlay.innerHTML='';overlay.style.pointerEvents='none';hud.style.display='block';}
 if(a==='quit'){screen='stages';paused=false;overlay.style.pointerEvents='auto';hud.style.display='none';}
 if(a==='retry')startRace();
 if(a==='shop')screen='shop';
 if(a==='upgrade'&&v){const costs:Record<string,number>={engine:600,suspension:520,tyres:420,frame:650};const level=save.upgrades[v]||0,price=costs[v]*(level+1);if(level<3&&save.coins>=price){save.coins-=price;save.upgrades[v]=level+1;saveGame(save);}}
 if(a==='continue'){const next=stageIndex+1,list=stages.filter(x=>x.mode===mode);if(next<list.length){stageIndex=next;screen='stages';}else screen='modes';}
 if(a!=='pause'&&a!=='resume'&&a!=='quit')draw();
}
const keyNames:Record<string,string>={ArrowUp:'w',ArrowDown:'s',ArrowLeft:'a',ArrowRight:'d',' ':'q',Shift:'e',w:'w',s:'s',a:'a',d:'d',q:'q',e:'e'};
addEventListener('keydown',e=>{const k=keyNames[e.key];if(k){e.preventDefault();keys.add(k);}if(e.key==='Escape'&&screen==='playing')action('pause');});
addEventListener('keyup',e=>{const k=keyNames[e.key];if(k)keys.delete(k);});
touch.addEventListener('pointerdown',e=>{const el=(e.target as HTMLElement).closest<HTMLElement>('[data-key]');if(!el)return;el.setPointerCapture(e.pointerId);const k=el.dataset.key;if(k==='w')touchState.throttle=1;if(k==='s')touchState.brake=1;if(k==='a')touchState.left=1;if(k==='d')touchState.right=1;if(k==='q')touchState.trick=1;if(k==='e')touchState.trick=-1;});
touch.addEventListener('pointerup',e=>{const el=(e.target as HTMLElement).closest<HTMLElement>('[data-key]');if(!el)return;const k=el.dataset.key;if(k==='w')touchState.throttle=0;if(k==='s')touchState.brake=0;if(k==='a')touchState.left=0;if(k==='d')touchState.right=0;if(k==='q'||k==='e')touchState.trick=0;});
touch.addEventListener('pointercancel',()=>touchState={throttle:0,brake:0,left:0,right:0,trick:0});
function inputNow():Input {const pad=navigator.getGamepads?.()[0],axis=pad?.axes[0]||0,padThrottle=Math.max(pad?.buttons[7]?.value||0,pad?.buttons[0]?.pressed?1:0),padBrake=Math.max(pad?.buttons[6]?.value||0,pad?.buttons[1]?.pressed?1:0),throttle=Math.max(touchState.throttle,keys.has('w')?1:0,padThrottle),brake=Math.max(touchState.brake,keys.has('s')?1:0,padBrake),lean=(keys.has('d')?1:0)-(keys.has('a')?1:0)+touchState.right-touchState.left+axis,trick=(keys.has('e')?1:0)-(keys.has('q')?1:0)+touchState.trick+(pad?.buttons[5]?.pressed?1:0)-(pad?.buttons[4]?.pressed?1:0);return {throttle,brake,lean:Math.max(-1,Math.min(1,lean)),trick:Math.max(-1,Math.min(1,trick))};}
function frame(now:number){
 const dt=Math.min(.05,(now-last)/1000);last=now;
 if(screen==='playing'&&!paused){const input=inputNow();acc+=dt;const step=1/120;let n=0;while(acc>=step&&n++<8){tick(ride,input,step,terrain,selectedBike(),selectedRider(),mode,save.upgrades,100+stageFor(mode,stageIndex).distance*4);acc-=step;}renderer.render(ride,terrain,selectedBike(),selectedRider(),mode,true);hudTimer+=dt;if(hudTimer>.075){hudTimer=0;drawHud();}if(ride.finished)endRace();}
 else {const st=stageFor(mode,stageIndex),scene=new Terrain(st.seed,st.distance*4+1000,mode),dummy=newRide();dummy.x=920;dummy.y=scene.sample(dummy.x).y-34;dummy.vx=105;dummy.speed=105;dummy.angle=-.2;renderer.render(dummy,scene,selectedBike(),selectedRider(),screen==='home'?'freestyle':mode,false);}
 requestAnimationFrame(frame);
}
screen='home';draw();requestAnimationFrame(frame);
if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('/sw.js').catch(()=>{});
