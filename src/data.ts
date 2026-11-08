export type Mode = 'freestyle'|'timeattack'|'survival'|'dunes';
export type Surface = 'dirt'|'mud'|'rock'|'sand'|'grass'|'dune';
export type Bike = { id:string; name:string; maker:string; electric:boolean; speed:number; power:number; weight:number; suspension:number; price:number; color:string; tier:number };
export type Rider = { id:string; name:string; tag:string; skin:string; hair:string; suit:string; agility:number; style:number; grit:number; bio:string };
export type Stage = { id:string; name:string; location:string; mode:Mode; distance:number; difficulty:number; reward:number; bronze:number; silver:number; gold:number; seed:number; surfaces:Surface[] };
export const riders:Rider[]=[
 {id:'leni',name:'LENI',tag:'THE COMET',skin:'#e6b58f',hair:'#e2c348',suit:'#27d2c5',agility:9,style:8,grit:5,bio:'Aérien et précis. Les figures s’enchaînent vite.'},
 {id:'rose',name:'ROSE',tag:'REDLINE',skin:'#f0c5a6',hair:'#b95335',suit:'#f65052',agility:8,style:9,grit:6,bio:'Née pour le freestyle et les gros combos.'},
 {id:'olivier',name:'OLIVIER',tag:'THE ANCHOR',skin:'#c98f67',hair:'#3a2925',suit:'#e6a900',agility:5,style:6,grit:10,bio:'Solide et stable. Encaisse les réceptions dures.'},
 {id:'noa',name:'NOA',tag:'DUST DEVIL',skin:'#b87b59',hair:'#171e28',suit:'#a5d64d',agility:8,style:7,grit:7,bio:'Un pilote équilibré pour tous les terrains.'},
 {id:'ines',name:'INÈS',tag:'WILDCARD',skin:'#f1d1b1',hair:'#25242e',suit:'#bb78ff',agility:10,style:8,grit:4,bio:'Hyper agile, avec des réceptions plus délicates.'},
 {id:'malik',name:'MALIK',tag:'IRON CLUTCH',skin:'#754b39',hair:'#11151b',suit:'#4b8dff',agility:6,style:6,grit:9,bio:'Du couple, de la maîtrise et du sang-froid.'}
];
export const bikes:Bike[]=[
 {id:'mx250',name:'MX 250',maker:'RAPTOR',electric:false,speed:76,power:74,weight:58,suspension:68,price:0,color:'#fa4e34',tier:1},
 {id:'mx450',name:'MX 450',maker:'RAPTOR',electric:false,speed:91,power:91,weight:65,suspension:76,price:1250,color:'#f6b900',tier:2},
 {id:'volt',name:'VOLT E-X',maker:'VOLT',electric:true,speed:82,power:97,weight:61,suspension:82,price:1600,color:'#49d4c6',tier:2},
 {id:'desert',name:'DUNE 500',maker:'NOMAD',electric:false,speed:99,power:87,weight:72,suspension:92,price:2600,color:'#b47aff',tier:3},
 {id:'prototype',name:'X-PROTO',maker:'X LAB',electric:true,speed:100,power:100,weight:55,suspension:96,price:4300,color:'#70e86b',tier:4}
];
const stage=(id:string,name:string,location:string,mode:Mode,distance:number,difficulty:number,reward:number,times:[number,number,number],seed:number,surfaces:Surface[]):Stage=>({id,name,location,mode,distance,difficulty,reward,bronze:times[0],silver:times[1],gold:times[2],seed,surfaces});
export const modes:{id:Mode;title:string;subtitle:string;icon:string;color:string}[]=[
 {id:'freestyle',title:'FREESTYLE',subtitle:'JUMP. SPIN. REPEAT.',icon:'✦',color:'#ff593f'},
 {id:'timeattack',title:'TIME ATTACK',subtitle:'BATTE LE CHRONO.',icon:'◷',color:'#50d2c3'},
 {id:'survival',title:'SURVIE TECHNIQUE',subtitle:'GARDE LA MOTO DEBOUT.',icon:'⌁',color:'#a6d54c'},
 {id:'dunes',title:'DUNES RUN',subtitle:'PLEIN GAZ, GRAND AIR.',icon:'〰',color:'#f4b900'}
];
export const stages:Stage[]=[
 stage('f1','Warm-up Riot','RED ROCK PARK','freestyle',1900,1,420,[95,75,58],21,['dirt','rock','dirt','mud']),stage('f2','Scrapyard Jam','OLD IRON YARD','freestyle',2400,2,560,[120,95,78],37,['dirt','rock','mud','dirt']),stage('f3','Skyline Send','MESA RIDGE','freestyle',2800,3,760,[145,115,93],50,['rock','dirt','dune','rock']),
 stage('t1','Dust Sprint','CANYON LOOP','timeattack',2300,1,460,[94,78,65],63,['dirt','grass','rock']),stage('t2','Switchback 88','PINE VALLEY','timeattack',2900,2,650,[115,96,80],71,['grass','mud','rock']),stage('t3','Last Light','BURNING MESA','timeattack',3300,3,900,[132,108,90],83,['dirt','dune','rock']),
 stage('s1','Loose Ground','QUARRY 04','survival',2100,1,500,[125,100,80],97,['rock','mud','dirt']),stage('s2','No Mistakes','BLACK PINE','survival',2700,2,720,[150,122,96],109,['mud','grass','rock']),stage('s3','The Gauntlet','NORTH RIDGE','survival',3200,3,1050,[180,145,115],121,['rock','mud','dune']),
 stage('d1','Sandstorm 01','GOLDEN BASIN','dunes',2900,1,540,[110,90,72],133,['sand','dune','dune']),stage('d2','Rolling Thunder','RED DUNE SEA','dunes',3700,2,790,[135,110,88],145,['dune','sand','rock']),stage('d3','Horizon Burner','THE BADLANDS','dunes',4500,3,1200,[160,132,105],157,['dune','dune','sand'])
];
export const stageFor=(mode:Mode,index:number)=>stages.filter(s=>s.mode===mode)[Math.min(index,2)];
