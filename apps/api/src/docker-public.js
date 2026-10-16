// Inspection is available to read-only users. Return useful fields, never arbitrary
// driver options, environment variables, commands, labels or plugin status blobs.
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>value?.[key]!==undefined).map(key=>[key,value[key]]));
export function publicDockerImage(value){return {...pick(value,['Id','Created','Architecture','Os','Size','VirtualSize','RepoTags','RepoDigests']),...(value?.RootFS?{RootFS:{Type:value.RootFS.Type,Layers:value.RootFS.Layers||[]}}:{})};}
export function publicDockerVolume(value){return {...pick(value,['Name','Driver','Mountpoint','CreatedAt','Scope']),...(value?.UsageData?{UsageData:pick(value.UsageData,['Size','RefCount'])}:{})};}
export function publicComposeLabels(labels={}){return pick(labels,['com.docker.compose.project','com.docker.compose.service','com.docker.compose.version','com.docker.compose.project.working_dir','com.docker.compose.project.config_files']);}
