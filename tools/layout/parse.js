const fs=require('fs');const dir=process.argv[2];
let src='';for(const i of [8,10,12,14,16,18,20,22]){try{src+=fs.readFileSync(dir+'/s'+i+'.bin','latin1')+'\n'}catch(e){}}
const toks=src.match(/\((?:\\.|[^\\)])*\)|\[[^\]]*\]|<<|>>|\/[^\s\/\[\]()<>]+|[-+]?\d*\.?\d+\.?|[A-Za-z'"*]+/g);
let st=[],stroke='0 0 0',fill='0 0 0',lw=1,path=[],cur=null,segs=[],texts=[],tm=null,font=0;
const unesc=s=>s.slice(1,-1).replace(/\\(.)/g,'$1');
for(const t of toks){
 if(/^[-+]?\d*\.?\d+\.?$/.test(t)){st.push(parseFloat(t));continue}
 if(t[0]=='('||t[0]=='/'||t[0]=='['){st.push(t);continue}
 switch(t){
 case 'RG':stroke=st.slice(-3).map(v=>+(+v).toFixed(2)).join(' ');break;
 case 'rg':fill=st.slice(-3).map(v=>+(+v).toFixed(2)).join(' ');break;
 case 'w':lw=st[st.length-1];break;
 case 'm':cur=[st[st.length-2],st[st.length-1]];break;
 case 'l':{const p=[st[st.length-2],st[st.length-1]];path.push({a:cur,b:p});cur=p;break}
 case 'c':{const p=[st[st.length-2],st[st.length-1]];path.push({a:cur,b:p,curve:1});cur=p;break}
 case 're':{const [x,y,w,h]=st.slice(-4);const P=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];for(let k=0;k<4;k++)path.push({a:P[k],b:P[(k+1)%4]});break}
 case 'S':case 's':case 'f':case 'F':case 'b':case 'B':case 'f*':case 'B*':case 'b*':
   for(const p of path)if(p.a)segs.push([p.a[0],p.a[1],p.b[0],p.b[1],t==='S'||t==='s'?stroke:fill,t,lw]);path=[];break;
 case 'n':path=[];break;
 case 'Tf':font=st[st.length-1];break;
 case 'Tm':tm=st.slice(-6);break;
 case 'Tj':if(typeof st[st.length-1]==='string')texts.push({s:unesc(st[st.length-1]),x:tm[4],y:tm[5],a:tm[0],b:tm[1],font,col:fill});break;
 }
 st=[];
}
const cols={};for(const s of segs){const k=s[4]+' '+s[5];cols[k]=(cols[k]||0)+1}
console.log(cols);
fs.writeFileSync(dir+'/segs.json',JSON.stringify(segs));fs.writeFileSync(dir+'/texts.json',JSON.stringify(texts));
console.log(texts.length);for(const t of texts)if(t.x<6500)console.log(t.s,'|',Math.round(t.x),Math.round(t.y),t.font,t.col,(+t.a).toFixed(2),(+t.b).toFixed(2));
