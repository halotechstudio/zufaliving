const fs=require('fs'),zlib=require('zlib');
const buf=fs.readFileSync(process.argv[2]);const out=process.argv[3];
const s=buf.toString('latin1');let re=/stream\r?\n/g,m,i=0;
while((m=re.exec(s))){const st=m.index+m[0].length;const end=s.indexOf('endstream',st);
 const dict=s.slice(Math.max(0,m.index-300),m.index);
 let data=buf.slice(st,end);let d;try{d=zlib.inflateSync(data)}catch(e){try{d=zlib.inflateRawSync(data.slice(2))}catch(e2){d=null}}
 const head=dict.slice(dict.lastIndexOf('obj'));
 console.log(i,'len',data.length,'->',d?d.length:'fail',head.replace(/\s+/g,' ').slice(0,160));
 if(d)fs.writeFileSync(out+'/s'+i+'.bin',d);i++;}
