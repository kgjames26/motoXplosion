import {Terrain} from './terrain';
import {RiderState} from './physics';
import {Bike,Rider,Mode} from './data';
const W=1280,H=720;
const surfaceColors:Record<string,string>={dirt:'#a95f32',mud:'#56453a',rock:'#777c77',sand:'#d6a85e',grass:'#637947',dune:'#d0a457'};
export class Renderer {
 canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;dpr=1;camX=0;camY=0;clock=0;
 constructor(canvas:HTMLCanvasElement){this.canvas=canvas;const c=canvas.getContext('2d');if(!c)throw new Error('Canvas unavailable');this.ctx=c;this.resize();addEventListener('resize',()=>this.resize());}
 resize(){const rect=this.canvas.getBoundingClientRect();this.dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.floor(rect.width*this.dpr);this.canvas.height=Math.floor(rect.height*this.dpr);}
 render(state:RiderState,terrain:Terrain,bike:Bike,rider:Rider,mode:Mode,active=true){
  const c=this.ctx;this.clock+=1/60;const sx=this.canvas.width/W,sy=this.canvas.height/H;c.setTransform(sx,0,0,sy,0,0);
  const targetX=active?state.x+250:600,targetY=active?state.y-140:275;this.camX+=(targetX-this.camX)*(active?.08:.018);this.camY+=(targetY-this.camY)*(active?.08:.018);
  const shake=active?state.shake:Math.sin(this.clock*1.5)*1.5;c.save();c.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);
  this.background(c,mode);
  c.save();c.translate(640-this.camX,300-this.camY);
  this.drawLand(c,terrain);
  this.drawProps(c,terrain,mode);
  this.drawBike(c,state,bike,rider);
  if(active)this.drawParticles(c,state);
  c.restore();
  if(active)this.speedStreaks(c,state);
  this.vignette(c);c.restore();
 }
 private background(c:CanvasRenderingContext2D,mode:Mode){
  const dune=mode==='dunes';const g=c.createLinearGradient(0,0,0,H);g.addColorStop(0,dune?'#f89b5a':'#25455c');g.addColorStop(.47,dune?'#f4c174':'#6eb5c1');g.addColorStop(1,dune?'#ecd09c':'#ddc083');c.fillStyle=g;c.fillRect(0,0,W,H);
  c.fillStyle='rgba(255,220,132,.74)';c.beginPath();c.arc(1020,112,49,0,Math.PI*2);c.fill();
  c.fillStyle=dune?'#be7654':'#31566a';c.beginPath();c.moveTo(0,360);for(let x=0;x<=W+10;x+=10){const wx=(x+this.camX*.13);c.lineTo(x,330+Math.sin(wx*.004)*60+Math.sin(wx*.01)*18);}c.lineTo(W,H);c.lineTo(0,H);c.fill();
  c.fillStyle=dune?'#d18f60':'#49736b';c.beginPath();c.moveTo(0,440);for(let x=0;x<=W+10;x+=10){const wx=x+this.camX*.24;c.lineTo(x,415+Math.sin(wx*.005+2)*34+Math.sin(wx*.014)*12);}c.lineTo(W,H);c.lineTo(0,H);c.fill();
  for(let i=0;i<45;i++){const x=((i*113-this.camX*.35)%1420+1420)%1420-70,y=100+(i*53)%230,r=1+(i%3);c.fillStyle='rgba(255,255,255,.13)';c.fillRect(x,y,r*2,1);}
 }
 private drawLand(c:CanvasRenderingContext2D,t:Terrain){
  c.beginPath();c.moveTo(this.camX-900,780);let last=t.sample(this.camX-900);c.lineTo(this.camX-900,last.y);
  for(let x=this.camX-900;x<this.camX+1100;x+=8){const p=t.sample(x);c.lineTo(x,p.y);}
  c.lineTo(this.camX+1100,780);c.closePath();const g=c.createLinearGradient(0,450,0,780);g.addColorStop(0,'#b77a43');g.addColorStop(.34,'#765039');g.addColorStop(1,'#352c29');c.fillStyle=g;c.fill();
  c.beginPath();for(let x=this.camX-900;x<this.camX+1100;x+=7){const p=t.sample(x);if(x===Math.floor((this.camX-900)/7)*7)c.moveTo(x,p.y);else c.lineTo(x,p.y);}c.lineWidth=8;c.strokeStyle='#f4ce77';c.stroke();
  c.beginPath();for(let x=this.camX-900;x<this.camX+1100;x+=22){const p=t.sample(x);if(x===Math.floor((this.camX-900)/22)*22)c.moveTo(x,p.y+5);else c.lineTo(x,p.y+5);}c.lineWidth=3;c.strokeStyle='#643d2c';c.stroke();
  for(let x=Math.floor((this.camX-700)/35)*35;x<this.camX+800;x+=35){const p=t.sample(x);c.fillStyle=surfaceColors[p.surface];c.globalAlpha=.6;c.fillRect(x,p.y+12,16+(x%3)*5,3);c.globalAlpha=1;}
 }
 private drawProps(c:CanvasRenderingContext2D,t:Terrain,mode:Mode){
  const start=Math.floor((this.camX-700)/260)*260;for(let x=start;x<this.camX+900;x+=260){const ground=t.sample(x).y;
   if(mode==='dunes'){c.fillStyle='#855c48';c.fillRect(x-2,ground-74,4,74);c.fillStyle='#ffecbe';c.beginPath();c.moveTo(x,ground-74);c.lineTo(x+49,ground-58);c.lineTo(x,ground-42);c.fill();}
   else {c.fillStyle='#254342';c.beginPath();c.arc(x,ground-90,28,0,Math.PI*2);c.arc(x-23,ground-63,22,0,Math.PI*2);c.fill();c.fillStyle='#473831';c.fillRect(x-3,ground-48,7,52);}
  }
 }
 private drawBike(c:CanvasRenderingContext2D,s:RiderState,b:Bike,r:Rider){
  const x=s.x,y=s.y,angle=s.angle; c.save();c.translate(x,y);c.rotate(angle);
  const rear=-38,front=38,wy=13;
  for(const wx of [rear,front]){c.beginPath();c.arc(wx,wy,19,0,Math.PI*2);c.fillStyle='#1c2228';c.fill();c.lineWidth=4;c.strokeStyle='#d5d8d4';c.stroke();c.beginPath();c.arc(wx,wy,4,0,Math.PI*2);c.fillStyle='#f2c64f';c.fill();c.save();c.translate(wx,wy);c.rotate(this.clock*(Math.abs(s.vx)/40));c.strokeStyle='#7a8586';c.lineWidth=1.5;for(let i=0;i<8;i++){c.rotate(Math.PI/4);c.beginPath();c.moveTo(0,0);c.lineTo(0,-15);c.stroke();}c.restore();}
  c.lineCap='round';c.lineJoin='round';c.lineWidth=7;c.strokeStyle='#d8e0dc';c.beginPath();c.moveTo(rear,wy);c.lineTo(-8,-10);c.lineTo(10,-13);c.lineTo(front,wy);c.stroke();
  c.lineWidth=10;c.strokeStyle=b.color;c.beginPath();c.moveTo(-16,-13);c.lineTo(2,-24);c.lineTo(18,-19);c.lineTo(7,-9);c.closePath();c.fillStyle=b.color;c.fill();c.stroke();
  c.lineWidth=5;c.strokeStyle='#ddd';c.beginPath();c.moveTo(10,-13);c.lineTo(front,wy);c.moveTo(-12,-13);c.lineTo(rear,wy);c.stroke();
  c.strokeStyle='#333';c.lineWidth=4;c.beginPath();c.moveTo(front-4,-19);c.lineTo(front+12,-22);c.stroke();c.fillStyle='#222';c.fillRect(front+8,-25,5,5);
  c.strokeStyle='#c6d6d1';c.lineWidth=4;c.beginPath();c.moveTo(-12,-15);c.lineTo(-19,-31);c.lineTo(-5,-41);c.stroke();
  // Rider pose shifts with lean, acceleration and suspension compression.
  const crouch=s.compression*5,shift=Math.max(-10,Math.min(10,s.vx/50))+s.wheelie*8;
  c.strokeStyle='#15222b';c.lineWidth=9;c.beginPath();c.moveTo(-19,-31);c.lineTo(-7+shift,-39+crouch);c.lineTo(8+shift,-27);c.stroke();
  c.strokeStyle=r.suit;c.lineWidth=15;c.beginPath();c.moveTo(-7+shift,-39+crouch);c.lineTo(8+shift,-27);c.stroke();
  c.strokeStyle='#18242c';c.lineWidth=6;c.beginPath();c.moveTo(5+shift,-31);c.lineTo(13,-17);c.lineTo(17,-14);c.moveTo(-5+shift,-35);c.lineTo(-18,-20);c.stroke();
  c.strokeStyle='#ece6d6';c.lineWidth=5;c.beginPath();c.moveTo(13,-17);c.lineTo(21,-15);c.moveTo(-18,-20);c.lineTo(-21,-16);c.stroke();
  c.fillStyle=r.skin;c.beginPath();c.arc(-5+shift,-49+crouch,10,0,Math.PI*2);c.fill();c.fillStyle=r.hair;c.beginPath();c.arc(-7+shift,-53+crouch,9,Math.PI,Math.PI*1.95);c.lineTo(2+shift,-49+crouch);c.fill();
  c.fillStyle='#f4f1e8';c.beginPath();c.moveTo(-1+shift,-54+crouch);c.lineTo(12+shift,-50+crouch);c.lineTo(1+shift,-45+crouch);c.fill();c.fillStyle='#ff5135';c.fillRect(3+shift,-51+crouch,9,3);
  c.restore();
 }
 private drawParticles(c:CanvasRenderingContext2D,s:RiderState){for(const p of s.particles){c.globalAlpha=Math.max(0,p.life/p.max);c.fillStyle=p.color;if(p.kind==='spark'){c.fillRect(p.x-2,p.y-2,p.size+3,2);}else{c.beginPath();c.arc(p.x,p.y,p.size,0,Math.PI*2);c.fill();}}c.globalAlpha=1;}
 private speedStreaks(c:CanvasRenderingContext2D,s:RiderState){if(s.speed<205)return;c.globalAlpha=Math.min(.25,(s.speed-205)/600);c.strokeStyle='#fff4d0';c.lineWidth=2;for(let i=0;i<10;i++){const x=((i*159+this.clock*1200)%W);const y=200+(i*73)%420;c.beginPath();c.moveTo(x,y);c.lineTo(x-55-s.speed*.12,y+2);c.stroke();}c.globalAlpha=1;}
 private vignette(c:CanvasRenderingContext2D){const g=c.createRadialGradient(640,350,230,640,350,760);g.addColorStop(0,'rgba(10,14,18,0)');g.addColorStop(1,'rgba(8,10,13,.42)');c.fillStyle=g;c.fillRect(0,0,W,H);}
}
