// GitHub release pages need absolute links; source notes retain relative links.
import fs from 'node:fs';import path from 'node:path';
export function releaseNotes(content,{file,repository,tag}){
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)||!/^v\d+\.\d+\.\d+-rc\.\d+$/.test(tag))throw Error('Invalid release identity');
 return content.replace(/\[([^\]]*)\]\(([^\s)]+)\)/g,(match,label,target)=>{if(/^[a-z]+:/i.test(target)||target.startsWith('#'))return match;const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),target));if(resolved.startsWith('../')||resolved.startsWith('/'))throw Error('Release link leaves the repository');return `[${label}](https://github.com/${repository}/blob/${tag}/${resolved})`});
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname){const [file,repository,tag,output]=process.argv.slice(2);fs.writeFileSync(output,releaseNotes(fs.readFileSync(file,'utf8'),{file,repository,tag}))}
