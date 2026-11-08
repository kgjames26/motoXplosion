import { bikes, riders } from './data';
export type SaveData={coins:number; rider:string; bike:string; ownedBikes:string[]; upgrades:Record<string,number>; records:Record<string,{bestTime:number;bestScore:number;medal:number;clears:number}>};
const KEY='motoxplosion-save-v1';
const initial:SaveData={coins:1200,rider:riders[0].id,bike:bikes[0].id,ownedBikes:[bikes[0].id],upgrades:{engine:0,suspension:0,tyres:0,frame:0},records:{}};
export function loadSave():SaveData { try {const parsed=JSON.parse(localStorage.getItem(KEY)||'null'); if(!parsed)return structuredClone(initial); return {...structuredClone(initial),...parsed,upgrades:{...initial.upgrades,...parsed.upgrades}};} catch{return structuredClone(initial);} }
export function saveGame(data:SaveData){localStorage.setItem(KEY,JSON.stringify(data));}
export function resetSave(){localStorage.removeItem(KEY);return loadSave();}
