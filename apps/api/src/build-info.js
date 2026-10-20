import fs from 'node:fs';
const metadata=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8')),version=metadata.version;
const publisher={developer:metadata.author,company:metadata.company};
export function createBuildInfo({date=new Date().toISOString(),revision='',number=''}={}){
 const parsed=new Date(date);if(Number.isNaN(parsed.getTime()))throw Error('Invalid build date');
 if(revision&&!/^[a-f0-9]{7,40}$/i.test(revision))throw Error('Invalid build revision');
 const buildDate=parsed.toISOString(),stamp=buildDate.replace(/[-:TZ.]/g,'').slice(0,14),buildNumber=number||`${stamp}${revision?'-'+revision.slice(0,12):''}`;
 if(!/^[a-zA-Z0-9._+-]{1,100}$/.test(buildNumber))throw Error('Invalid build number');
 return {version,buildNumber,buildDate,revision:revision||null,license:'MIT',...publisher};
}
export function readBuildInfo(file=new URL('./build-info.json',import.meta.url)){
 try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(!saved||typeof saved.buildDate!=='string'||!saved.buildDate||typeof saved.buildNumber!=='string'||!saved.buildNumber||saved.version!==version)throw Error('Version mismatch');return createBuildInfo({date:saved.buildDate,number:saved.buildNumber,revision:saved.revision||''});}
 catch{return {version,buildNumber:null,buildDate:null,revision:null,license:'MIT',...publisher};}
}
export const buildInfo=Object.freeze(readBuildInfo());
