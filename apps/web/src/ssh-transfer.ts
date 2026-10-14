export const SHELL_INPUT_LIMIT=8192;
export const SFTP_DOWNLOAD_LIMIT=32*1024*1024;
type Operation=(body:any)=>Promise<any>;
export async function sendShellInput(text:string,send:(chunk:string)=>Promise<any>){
 for(let start=0;start<text.length;){
  let end=Math.min(start+SHELL_INPUT_LIMIT,text.length);
  // Keep surrogate pairs together so JSON and SSH preserve Unicode input.
  if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;
  await send(text.slice(start,end));start=end;
 }
}
export async function copyTerminalSelection(text:string){
 if(!navigator.clipboard?.writeText)throw Error('Copy is unavailable in this browser or connection. Use HTTPS or select and copy the text manually.');
 await navigator.clipboard.writeText(text);
}
export async function fullscreenTerminal(element:HTMLElement|null){
 if(!element?.requestFullscreen)throw Error('Fullscreen is unavailable in this browser.');
 await element.requestFullscreen();
}
export async function collectSFTPDownload(operation:Operation,path:string){
 const stat=await operation({action:'stat',path});
 if(!stat.file||stat.link)throw Error('Only regular files can be downloaded.');
 if(!Number.isSafeInteger(stat.size)||stat.size<0||stat.size>SFTP_DOWNLOAD_LIMIT)throw Error('Browser downloads are limited to 32 MiB. Use an SFTP client for larger files.');
 const chunks:Uint8Array[]=[];let offset=0;
 for(;;){
  const r=await operation({action:'read',path,offset});
  const bytes=Uint8Array.from(atob(r.data),c=>c.charCodeAt(0));
  if(bytes.length>SFTP_DOWNLOAD_LIMIT-offset)throw Error('The file exceeded the 32 MiB browser download limit. Use an SFTP client.');
  chunks.push(bytes);offset+=bytes.length;
  if(r.done)break;
  if(!bytes.length)throw Error('The download made no progress. Retry the download.');
 }
 return new Blob(chunks as BlobPart[]);
}
export async function uploadSFTPFiles(files:File[],directory:string,replace:boolean,operation:Operation){
 for(let i=0;i<files.length;i++){
  const file=files[i];
  try{
   let offset=0;
   do{
    const bytes=new Uint8Array(await file.slice(offset,offset+262144).arrayBuffer());
    let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
    await operation({action:'write',path:(directory==='/'?'':directory)+'/'+file.name,offset,data:btoa(binary),replace});offset+=bytes.length;
   }while(offset<file.size);
  }catch(error){throw Object.assign(new Error(error instanceof Error?error.message:'Upload failed'),{remainingFiles:files.slice(i)});}
 }
}
