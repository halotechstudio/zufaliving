// Extract plot polygons from parsed PDF vectors by rasterising magenta boundary lines and flood-filling from labels
const fs=require('fs'),zlib=require('zlib');
const dir=process.argv[2];
const segs=JSON.parse(fs.readFileSync(dir+'/segs.json'));
const texts=JSON.parse(fs.readFileSync(dir+'/texts.json'));
const mag=segs.filter(s=>s[4]==='1 0 1');
let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
for(const s of mag){minx=Math.min(minx,s[0],s[2]);maxx=Math.max(maxx,s[0],s[2]);miny=Math.min(miny,s[1],s[3]);maxy=Math.max(maxy,s[1],s[3]);}
console.log('magenta segs',mag.length,'bbox',minx,miny,maxx,maxy);
const pad=40,K=1; // 1 px per unit
const W=Math.ceil((maxx-minx)*K)+2*pad,H=Math.ceil((maxy-miny)*K)+2*pad;
const toPx=(x,y)=>[(x-minx)*K+pad,(y-miny)*K+pad];
const g=new Uint8Array(W*H);
function line(x0,y0,x1,y1,r){const n=Math.ceil(Math.hypot(x1-x0,y1-y0))+1;for(let i=0;i<=n;i++){const x=x0+(x1-x0)*i/n,y=y0+(y1-y0)*i/n;for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const X=Math.round(x+dx),Y=Math.round(y+dy);if(X>=0&&Y>=0&&X<W&&Y<H)g[Y*W+X]=1}}}
for(const s of mag){const a=toPx(s[0],s[1]),b=toPx(s[2],s[3]);line(a[0],a[1],b[0],b[1],2)}
// labels
const labels={};
for(const t of texts){if(/^\d+$/.test(t.s)&&t.col==='0 0 0'&&t.font>=35&&(t.y>2900||t.x<5900)){const n=+t.s;if(n>=1&&n<=59&&!labels[n])labels[n]=t}}
const club=texts.filter(t=>/CLUB/i.test(t.s));
console.log('labels found',Object.keys(labels).length,'missing',[...Array(59)].map((_,i)=>i+1).filter(n=>!labels[n]));
console.log('club',club.map(t=>[t.s,t.x,t.y]));
// flood fill
const lab=new Int16Array(W*H);
function fill(px,py,id){
 px=Math.round(px);py=Math.round(py);
 // find a free pixel near seed
 let found=false;for(let r=0;r<60&&!found;r++)for(let dy=-r;dy<=r&&!found;dy++)for(let dx=-r;dx<=r;dx++){const i=(py+dy)*W+px+dx;if(!g[i]&&!lab[i]){px+=dx;py+=dy;found=true;break}}
 const st=[py*W+px];let cnt=0;const pts=[];
 while(st.length){const i=st.pop();if(g[i]||lab[i])continue;lab[i]=id;cnt++;const x=i%W,y=(i/W)|0;pts.push(x,y);if(x<=0||y<=0||x>=W-1||y>=H-1){return {leak:true,cnt}}
  st.push(i+1,i-1,i+W,i-W);}
 return {cnt,pts};
}
function hull(pts){const P=[];for(let i=0;i<pts.length;i+=2)P.push([pts[i],pts[i+1]]);P.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);const lo=[],up=[];for(const p of P){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p)}for(let i=P.length-1;i>=0;i--){const p=P[i];while(up.length>=2&&cr(up[up.length-2],up[up.length-1],p)<=0)up.pop();up.push(p)}up.pop();lo.pop();return lo.concat(up)}
function dp(poly,eps){ // closed polygon simplify: iteratively remove vertex with smallest triangle area
 poly=poly.slice();const area=(a,b,c)=>Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;
 while(poly.length>3){let mi=-1,mv=1e18;for(let i=0;i<poly.length;i++){const v=area(poly[(i-1+poly.length)%poly.length],poly[i],poly[(i+1)%poly.length]);if(v<mv){mv=v;mi=i}}if(mv>eps)break;poly.splice(mi,1)}return poly}
const out={};
const seeds=Object.entries(labels).map(([n,t])=>[+n,t.x,t.y]);
for(const c of club)if(/POOL/.test(c.s))seeds.push(['club',c.x,c.y]);
let id=1;
for(const [n,x,y] of seeds){const [px,py]=toPx(x,y);const r=fill(px,py,id++);if(r.leak){console.log('LEAK',n,r.cnt);continue}
 const h=dp(hull(r.pts),800);
 out[n]={areaPx:r.cnt,poly:h.map(p=>[+((p[0]-pad)/K+minx).toFixed(1),+((p[1]-pad)/K+miny).toFixed(1)])};
}
// exterior fill from corner -> site mask
const ext=new Uint8Array(W*H);{const st=[0];while(st.length){const i=st.pop();if(i<0||i>=W*H||g[i]||ext[i])continue;ext[i]=1;const x=i%W;if(x>0)st.push(i-1);if(x<W-1)st.push(i+1);st.push(i+W,i-W)}}
let siteCnt=0;for(let i=0;i<W*H;i++)if(!ext[i])siteCnt++;
console.log('site px area (incl lines)',siteCnt);
// ---- site outline via morphological closing of plot regions on a coarse grid
const C=8,gw=Math.ceil(W/C),gh=Math.ceil(H/C);let m=new Uint8Array(gw*gh);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;if(lab[i]>0||(g[i]&&!ext[i]&&y>1000/K))m[((y/C)|0)*gw+((x/C)|0)]=1}
function morph(src,r,dil){const o=new Uint8Array(gw*gh);for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){let v=dil?0:1;outer:for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(dx*dx+dy*dy>r*r)continue;const X=x+dx,Y=y+dy;const s=(X<0||Y<0||X>=gw||Y>=gh)?0:src[Y*gw+X];if(dil&&s){v=1;break outer}if(!dil&&!s){v=0;break outer}}o[y*gw+x]=v}return o}
const R=+process.argv[3]||28;let cm=morph(morph(m,R,1),R,0);
// keep largest component
{const seen=new Int32Array(gw*gh);let best=0,bestId=0,id=0;for(let i=0;i<gw*gh;i++)if(cm[i]&&!seen[i]){id++;let c=0;const st=[i];while(st.length){const j=st.pop();if(!cm[j]||seen[j])continue;seen[j]=id;c++;const x=j%gw;if(x>0)st.push(j-1);if(x<gw-1)st.push(j+1);if(j>=gw)st.push(j-gw);if(j<gw*(gh-1))st.push(j+gw)}if(c>best){best=c;bestId=id}}for(let i=0;i<gw*gh;i++)cm[i]=seen[i]===bestId?1:0}
// boundary trace (Moore)
function trace(){let s=-1;for(let i=0;i<gw*gh;i++)if(cm[i]){s=i;break}const dirs=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];const at=(x,y)=>x>=0&&y>=0&&x<gw&&y<gh&&cm[y*gw+x];let x=s%gw,y=(s/gw)|0;const sx=x,sy=y;const pts=[[x,y]];let d=6;for(let k=0;k<200000;k++){let found=false;for(let j=0;j<8;j++){const nd=(d+6+j)%8;const nx=x+dirs[nd][0],ny=y+dirs[nd][1];if(at(nx,ny)){x=nx;y=ny;d=nd;found=true;break}}if(!found||(x===sx&&y===sy))break;pts.push([x,y])}return pts}
let outline=trace();
function rdp(pts,eps){if(pts.length<3)return pts;const a=pts[0],b=pts[pts.length-1];let md=0,mi=0;for(let i=1;i<pts.length-1;i++){const p=pts[i];const d=Math.abs((b[0]-a[0])*(a[1]-p[1])-(a[0]-p[0])*(b[1]-a[1]))/(Math.hypot(b[0]-a[0],b[1]-a[1])||1);if(d>md){md=d;mi=i}}if(md>eps){const l=rdp(pts.slice(0,mi+1),eps),r=rdp(pts.slice(mi),eps);return l.slice(0,-1).concat(r)}return[a,b]}
outline=rdp(outline,1.2).map(p=>[+(((p[0]+.5)*C-pad)/K+minx).toFixed(1),+(((p[1]+.5)*C-pad)/K+miny).toFixed(1)]);
console.log('outline pts',outline.length);
const extras={gate:texts.filter(t=>/GATE|^IN$|^OUT$/.test(t.s)).map(t=>[t.s,t.x,t.y]),roads:texts.filter(t=>/WIDE ROAD/.test(t.s)).map(t=>[t.s,t.x,t.y,t.a,t.b]),dg:texts.filter(t=>/D\.G SET/.test(t.s)).map(t=>[t.x,t.y])};
fs.writeFileSync(dir+'/plots_raw.json',JSON.stringify({minx,miny,maxx,maxy,W,H,pad,K,plots:out,outline,extras}));
{const w=gw,h=gh;const img=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++){img[y*(w*3+1)]=0;for(let x=0;x<w;x++){const v=cm[y*gw+x]?(m[y*gw+x]?[60,120,60]:[90,90,90]):[255,255,255];img.set(v,y*(w*3+1)+1+x*3)}}globalThis.__site={w,h,img}}
for(const [k,v] of Object.entries(out))console.log(k,v.areaPx,v.poly.length);
// write preview PNG (downscaled 1/3)
const S=3,w=Math.floor(W/S),h=Math.floor(H/S);const img=Buffer.alloc((w*3+1)*h);
const colOf=i=>{if(g[i])return[200,0,200];if(ext[i])return[255,255,255];const l=lab[i];if(!l)return[230,230,230];return[(l*67)%200+40,(l*131)%200+40,(l*29)%200+40]};
for(let y=0;y<h;y++){img[y*(w*3+1)]=0;for(let x=0;x<w;x++){const c=colOf((y*S)*W+x*S);img.set(c,y*(w*3+1)+1+x*3)}}
function crc(b){let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}c=0xffffffff;for(const x of b)c=t[(c^x)&255]^(c>>>8);return(c^0xffffffff)>>>0}
function chunk(ty,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(ty),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c])}
const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;
{const {w,h,img}=globalThis.__site;const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;fs.writeFileSync(dir+'/site.png',Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(img)),chunk('IEND',Buffer.alloc(0))]))}
fs.writeFileSync(dir+'/preview.png',Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(img)),chunk('IEND',Buffer.alloc(0))]));
