import type {Bike,Rider,Mode} from './data';
import {Terrain} from './terrain';
export type Input={throttle:number;brake:number;lean:number;trick:number};
export type Particle={x:number;y:number;vx:number;vy:number;life:number;max:number;color:string;size:number;kind:'dust'|'spark'|'debris'};
export type RiderState={x:number;y:number;vx:number;vy:number;angle:number;omega:number;grounded:boolean;speed:number;compression:number;wheelie:number;airTime:number;spin:number;score:number;combo:number;comboTimer:number;crashes:number;distance:number;time:number;finished:boolean;particles:Particle[];shake:number;lastSurface:string;lastX:number};
export function newRide(){return {x:100,y:250,vx:0,vy:0,angle:0,omega:0,grounded:false,speed:0,compression:0,wheelie:0,airTime:0,spin:0,score:0,combo:1,comboTimer:0,crashes:0,distance:0,time:0,finished:false,particles:[],shake:0,lastSurface:'dirt',lastX:100} as RiderState;}
export function tick(state:RiderState,input:Input,dt:number,terrain:Terrain,bike:Bike,rider:Rider,mode:Mode,upgrades:Record<string,number>,finishAt:number){
 if(state.finished)return;
 const oldGrounded=state.grounded, oldY=state.y,oldSpeed=state.vx;
 const mass=bike.weight*(1+(upgrades.frame||0)*-.025);
 const engine=bike.power+(upgrades.engine||0)*7;
 const gripBonus=(upgrades.tyres||0)*.06;
 const lean=input.lean;
 state.time+=dt;
 if(input.throttle>0)state.vx+= (engine/100)*260*input.throttle*dt/(mass/60);
 if(input.brake>0)state.vx-= (input.brake*310*dt)*(state.grounded?1:.42);
 const forward=state.vx;
 // Terrain resistance and surface-specific tyre bite.
 const groundAhead=terrain.sample(state.x+Math.sign(forward||1)*38);
 state.vx*=Math.pow(state.grounded?(.997-groundAhead.drag*.0008):.9995,dt*60);
 state.vx=Math.max(-140,Math.min(bike.speed*3.35+(upgrades.engine||0)*9,state.vx));
 state.vy+=700*dt;
 const wb=54, rearX=state.x-Math.cos(state.angle)*wb/2,frontX=state.x+Math.cos(state.angle)*wb/2;
 const rearY=state.y-Math.sin(state.angle)*wb/2,frontY=state.y+Math.sin(state.angle)*wb/2;
 const rear=terrain.sample(rearX),front=terrain.sample(frontX);
 const rPen=rearY+22-rear.y, fPen=frontY+22-front.y;
 const prevComp=state.compression;
 state.grounded=rPen>0||fPen>0;
 if(state.grounded){
  const hit=Math.max(0,rPen,fPen), speedImpact=Math.max(0,state.vy);
  const terrainGrip=Math.min(rear.grip,front.grip)+gripBonus;
  const suspension=bike.suspension+(upgrades.suspension||0)*8;
  const spring=1450+(suspension*5), damping=95+suspension*.62;
  // Two independent wheel contacts feed chassis lift and pitch.
  const rearForce=Math.max(0,rPen)*spring/2-Math.max(0,state.vy)*damping/2;
  const frontForce=Math.max(0,fPen)*spring/2-Math.max(0,state.vy)*damping/2;
  state.vy-=Math.max(rearForce,frontForce)*dt/Math.max(1,mass/60);
  state.y-=hit*.32;
  const surfacePitch=(front.y-rear.y)/wb;
  state.omega+=(surfacePitch-state.angle)*11*dt-(state.omega*4.2*dt);
  state.omega+=lean*1.9*dt;
  state.vx+=(-groundAhead.slope*48)*dt;
  state.vx*=1-(1-terrainGrip)*dt*.8;
  state.compression=Math.max(0,Math.min(1,(hit+Math.max(0,speedImpact)*.014)/30));
  if(!oldGrounded&&state.airTime>.22){
   terrain.deformAt(state.x,Math.min(6,speedImpact*.009));
   state.shake=Math.max(state.shake,Math.min(15,speedImpact*.045));
   for(let i=0;i<12;i++)state.particles.push({x:state.x+(Math.random()-.5)*50,y:Math.min(rear.y,front.y)-4,vx:(Math.random()-.5)*190,vy:-Math.random()*180,life:.55+Math.random()*.5,max:1,color:i%4?'#b98148':'#ffce63',size:2+Math.random()*5,kind:'debris'});
   if(speedImpact>150){if(mode==='survival'&&rider.grit<8)state.crashes++; state.combo=Math.max(1,state.combo-1);}
   state.airTime=0;
  }
  if(state.vx>18)state.angle+=(surfacePitch-state.angle)*Math.min(1,dt*3);
 }else{
  state.airTime+=dt;
  const torque=lean*(2.7+rider.agility*.085)*(1+state.speed/350);
  state.omega+=torque*dt;
  state.omega*=Math.pow(.997,dt*60);
  if(input.trick){state.omega+=input.trick*3.4*dt;state.spin+=input.trick*state.omega*dt;}
 }
 state.angle+=state.omega*dt;
 if(state.grounded){
  state.speed=Math.abs(state.vx);
  state.wheelie=Math.max(0,Math.sin(state.angle)*Math.sign(state.vx));
 }else {state.speed=Math.abs(state.vx);}
 // Tricks score only after landing cleanly; control angle stabilizes after release.
 if(input.trick&&state.grounded===false){state.comboTimer=2.2;}
 if(state.comboTimer>0&&!input.trick)state.comboTimer-=dt;
 if(oldGrounded===false&&state.grounded){
  const turns=Math.abs(state.spin)/(Math.PI*2);
  if(turns>.45&&Math.abs(state.angle)<.85){
   const pts=Math.round((turns*720+Math.min(300,state.airTime*180))*(1+rider.style*.07)*state.combo);
   state.score+=pts;state.combo=Math.min(5,state.combo+1);state.comboTimer=2.3;
   for(let i=0;i<16;i++)state.particles.push({x:state.x,y:state.y,vx:(Math.random()-.5)*160,vy:-Math.random()*170,life:.7,max:1,color:['#f9b900','#ff593f','#47dfce'][i%3],size:3+Math.random()*4,kind:'spark'});
  }else if(state.comboTimer<=0)state.combo=1;
  state.spin=0;
 }
 if(state.grounded&&Math.abs(state.angle)>1.27&&state.speed>95){
  state.crashes++; state.vx*=.54; state.vy=-145;state.omega*=.15;state.angle=Math.sign(state.angle)*.9;state.shake=14;
  for(let i=0;i<20;i++)state.particles.push({x:state.x,y:state.y,vx:(Math.random()-.5)*250,vy:-Math.random()*240,life:.9,max:1,color:i%3?'#8c7a64':'#ffd45c',size:2+Math.random()*5,kind:'debris'});
 }
 if(state.grounded&&state.y>terrain.sample(state.x).y-32){state.y=terrain.sample(state.x).y-32;state.vy=Math.min(0,state.vy);}
 state.distance=Math.max(state.distance,(state.x-100)*.25);
 state.shake=Math.max(0,state.shake-dt*15);
 // Brake and lean provide ground handling, while the rider's mass visibly shifts the chassis.
 if(state.grounded)state.angle+=lean*.0006*(forward/100);
 for(const p of state.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=230*dt;p.life-=dt;}
 state.particles=state.particles.filter(p=>p.life>0);
 if(state.x>=finishAt)state.finished=true;
 state.lastX=state.x;
}
