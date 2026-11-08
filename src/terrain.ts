import type {Surface} from './data';
export type TerrainSample={y:number;slope:number;surface:Surface;softness:number;grip:number;drag:number;rebound:number};
export class Terrain {
 seed:number; length:number; mode:string; deform=new Map<number,number>();
 constructor(seed:number,length:number,mode:string){this.seed=seed;this.length=length;this.mode=mode;}
 private noise(n:number){const x=Math.sin(n*12.9898+this.seed*78.233)*43758.5453;return x-Math.floor(x);}
 height(x:number){const t=x/110; let h=480+Math.sin(t*.47)*49+Math.sin(t*.91+1.5)*20+Math.sin(t*1.7+3)*9; h+=Math.sin(t*.17)*34; if(this.mode==='dunes')h+=Math.sin(t*.38)*36+Math.sin(t*.2+1)*28; if(this.mode==='survival')h+=Math.sin(t*1.2)*17; h+=Math.sin(t*2.15)*3.2; const d=this.deform.get(Math.round(x/24)); if(d)h+=d; return h;}
 sample(x:number):TerrainSample{const y=this.height(x),slope=(this.height(x+4)-this.height(x-4))/8; const p=((x+this.seed*31)%this.length)/this.length; let surface:Surface='dirt'; if(this.mode==='dunes')surface=p<.66?'dune':'sand'; else if(p<.12)surface='rock'; else if(p<.22)surface='mud'; else if(p<.32)surface='grass'; else surface='dirt'; const params:Record<Surface,[number,number,number,number]>={dirt:[.08,.82,1,1],mud:[.06,.44,1.4,.72],rock:[0,.7,.88,1.3],sand:[.15,.57,1.24,.8],grass:[.03,.77,.92,.92],dune:[.22,.62,1.1,1.2]}; const [softness,grip,drag,rebound]=params[surface];return {y,slope,surface,softness,grip,drag,rebound};}
 deformAt(x:number,amount:number){const i=Math.round(x/24),prev=this.deform.get(i)||0;this.deform.set(i,Math.max(-22,prev+amount));for(const j of [i-1,i+1])this.deform.set(j,(this.deform.get(j)||0)+amount*.38);}
}
