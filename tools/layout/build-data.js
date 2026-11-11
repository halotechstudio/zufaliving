// Convert extracted drawing-space geometry into world metres + plot schedule -> ES module
const fs=require('fs');
const raw=JSON.parse(fs.readFileSync(process.argv[2]));const outFile=process.argv[3];
// printed schedule from the drawing (guntas, sq yd)
const sched={};for(let i=1;i<=42;i++)sched[i]=[10,1210];
Object.assign(sched,{12:[10.55,1276],31:[9.66,1169],43:[7.10,860],44:[11.91,1441],45:[11.47,1388],46:[11.83,1432],47:[34.93,4226]});
for(let i=48;i<=59;i++)sched[i]=[20,2420];
// scale: calibrate drawing units -> feet using the 40 standard plots (raster px area ~= drawing units^2)
let s=0,n=0;for(let i=1;i<=42;i++){if(sched[i][0]===10&&raw.plots[i]){s+=raw.plots[i].areaPx;n++}}
const ftPerUnit=Math.sqrt(10890/(s/n))*1.006; // small correction for boundary line thickness
const m=ftPerUnit*0.3048;
console.log('ft/unit',ftPerUnit.toFixed(4),'m/unit',m.toFixed(5));
const o=raw.outline;let cx=0,cy=0;{let a=1e9,b=-1e9,c=1e9,d=-1e9;for(const p of o){a=Math.min(a,p[0]);b=Math.max(b,p[0]);c=Math.min(c,p[1]);d=Math.max(d,p[1])}cx=(a+b)/2;cy=(c+d)/2}
const W=(p)=>[+(-(p[1]-cy)*m).toFixed(2),+(-(p[0]-cx)*m).toFixed(2)]; // [x(east), z(south)]
const cat=(g)=>g===10?'quarter':g===20?'half':g===34.93?'signature':'bespoke';
const plots=[];
for(let i=1;i<=59;i++){const p=raw.plots[i];const poly=p.poly.map(W);let ax=0,az=0;for(const q of poly){ax+=q[0];az+=q[1]}
 plots.push({id:i,guntas:sched[i][0],sqyd:sched[i][1],cat:cat(sched[i][0]),poly,c:[+(ax/poly.length).toFixed(2),+(az/poly.length).toFixed(2)]});}
const club=raw.plots.club.poly.map(W);
const outline=o.map(W);
const gate=W([raw.extras.gate[0][1],raw.extras.gate[0][2]]);
const gate2=W([raw.extras.gate[1][1],raw.extras.gate[1][2]]);
const roads=raw.extras.roads.map(r=>({label:r[0].replace("FEETS","FEET").replace("FEET WIDE ROAD","road").replace("' ","′ "),p:W([r[1],r[2]]),ang:+Math.atan2(r[4],r[3]).toFixed(3)}));
const dg=W(raw.extras.dg[0]);
const js=`// Generated from "ZUFA - Layout L1.pdf" vector data. World units: metres. x = east, z = south.\nexport const SITE=${JSON.stringify({outline,club,gate:[(gate[0]+gate2[0])/2,(gate[1]+gate2[1])/2],dg,roads})};\nexport const PLOTS=${JSON.stringify(plots)};\n`;
fs.writeFileSync(outFile,js);
let bx=[1e9,-1e9],bz=[1e9,-1e9];for(const p of outline){bx=[Math.min(bx[0],p[0]),Math.max(bx[1],p[0])];bz=[Math.min(bz[0],p[1]),Math.max(bz[1],p[1])]}
console.log('extent x',bx,'z',bz,'gate',gate,'club',club[0]);
// sanity: polygon areas in sq yd
const area=pl=>{let a=0;for(let i=0;i<pl.length;i++){const p=pl[i],q=pl[(i+1)%pl.length];a+=p[0]*q[1]-q[0]*p[1]}return Math.abs(a/2)*1.19599};
for(const id of [1,12,43,47,48,59])console.log(id,Math.round(area(plots[id-1].poly)),'vs',sched[id][1]);
console.log('club',Math.round(area(club)),'vs 5099; site',Math.round(area(outline)));
