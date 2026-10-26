import {readFileSync} from 'node:fs';
import crypto from 'node:crypto';
export const connectorSource=readFileSync(new URL('./agent-assets/iclusters-node-agent.py',import.meta.url),'utf8');
export const connectorRelease=Object.freeze({version:Number(connectorSource.match(/^VERSION=(\d+)$/m)[1]),revision:crypto.createHash('sha256').update(connectorSource).digest('hex')});
export function connectorUpdateInfo(node){
 const known=!!node.lastSeen,newer=node.version>connectorRelease.version,available=known&&!newer&&(node.version<connectorRelease.version||node.revision!==connectorRelease.revision);
 return {...connectorRelease,available,state:!known?'unknown':newer?'newer':available?'available':'current'};
}
